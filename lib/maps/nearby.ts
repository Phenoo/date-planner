import { z } from "zod";
import type { Coordinates, NearbyResult, NearbySearch } from "./schema";
import { fitsVenueRequest, providerFactsSchema, providerPrice, travelEstimate, venueOpeningStatus } from "./venue-facts";
import { timeMinutes } from "@/lib/planner/schedule";

const negativePreferencePattern = /\b(?:no|avoid|without|not into|not interested in|don't (?:like|want|enjoy)|do not (?:like|want|enjoy))\s+[^,.!?;]*/gi;

export const placesResponseSchema = z.object({
  places: z.array(z.object({
    id: z.string(), displayName: z.object({ text: z.string() }), formattedAddress: z.string().default(""),
    primaryTypeDisplayName: z.object({ text: z.string() }).optional(), types: z.array(z.string()).default([]), businessStatus: z.string().optional(),
    location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
    attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).default([]),
    photos: z.array(z.object({ name: z.string(), authorAttributions: z.array(z.object({ displayName: z.string(), uri: z.string().optional() })).default([]) })).default([]),
  }).extend(providerFactsSchema.shape)).default([]),
});
export function excludedPlaceTypes(request: NearbySearch) {
  const negativeClauses = `${request.interests} ${request.notes}`.match(negativePreferencePattern) ?? [];
  const avoided = `${request.dislikes} ${negativeClauses.map((clause) => clause.split(/\b(?:but|instead)\b/i)[0]).join(" ")}`;
  const types = new Set<string>();
  if (/\b(?:arts?|galler(?:y|ies))\b/i.test(avoided)) types.add("art_gallery");
  if (/\bmuseums?\b/i.test(avoided)) types.add("museum");
  if (/\b(?:restaurants?|cafes?|cafés?|dining)\b/i.test(avoided)) { types.add("restaurant"); types.add("cafe"); }
  if (/\b(?:parks?|gardens?)\b/i.test(avoided)) { types.add("park"); types.add("botanical_garden"); }
  if (/\bbeach(?:es)?\b/i.test(avoided)) types.add("beach");
  if (/\b(?:movies?|cinemas?)\b/i.test(avoided)) types.add("movie_theater");
  if (/\bbowling\b/i.test(avoided)) types.add("bowling_alley");
  if (/\b(?:games?|arcades?)\b/i.test(avoided)) types.add("amusement_center");
  return types;
}

export function preferredPlaceTypes(request: NearbySearch) {
  const types = new Set<string>();
  const interests = request.interests.toLowerCase().replace(negativePreferencePattern, "");
  if (request.vibes.includes("Creative") || /\b(?:arts?|galler(?:y|ies)|museums?|pottery)\b/.test(interests)) { types.add("art_gallery"); types.add("museum"); }
  if (request.vibes.some((vibe) => ["Outdoors", "Relaxed", "Adventurous", "Active"].includes(vibe)) || /\b(?:nature|parks?|walks?|beach(?:es)?|gardens?)\b/.test(interests)) { types.add("park"); types.add("beach"); types.add("botanical_garden"); }
  if (request.vibes.some((vibe) => ["Playful", "Entertainment", "Active", "Adventurous"].includes(vibe)) || /\b(?:movies?|cinema|games?|bowling|karting|arcades?)\b/.test(interests)) { types.add("movie_theater"); types.add("bowling_alley"); types.add("amusement_center"); }
  if (request.includeFood && !request.avoidRestaurants) { types.add("restaurant"); types.add("cafe"); }
  if (!types.size) { types.add("park"); types.add("movie_theater"); types.add("amusement_center"); }
  const excluded = excludedPlaceTypes(request);
  return [...types].filter((type) => !excluded.has(type));
}

export function placeTypeGroups(request: NearbySearch) {
  const preferred = preferredPlaceTypes(request);
  const excluded = excludedPlaceTypes(request);
  return [
    preferred.filter((type) => ["art_gallery", "museum"].includes(type)),
    request.includeFood && !request.avoidRestaurants ? ["restaurant", "cafe"] : [],
    ["park", "beach", "botanical_garden"],
    ["movie_theater", "bowling_alley", "amusement_center"],
  ].map((group) => group.filter((type) => !excluded.has(type))).filter((group) => group.length);
}

function categoryGroup(category: string) {
  if (/\b(?:arts?|galler(?:y|ies)|museum|pottery|ceramic|studio|cultural)\b/i.test(category)) return "culture";
  if (/\b(?:restaurant|cafe|café|coffee|dining|bistro|bar|lounge|food)\b/i.test(category)) return "dining";
  if (/\b(?:park|garden|beach|nature|picnic)\b/i.test(category)) return "outdoors";
  if (/\b(?:cinema|movie|bowling|amusement|arcade|game|karaoke)\b/i.test(category)) return "entertainment";
  return category.trim().toLowerCase();
}

export function diversePlaces<T extends { id: string; category: string }>(places: readonly T[], limit = 3): T[] {
  const unique = [...new Map(places.map((place) => [place.id, place])).values()];
  const groups = new Set<string>();
  const varied = unique.filter((place) => { const group = categoryGroup(place.category); if (groups.has(group)) return false; groups.add(group); return true; });
  return [...new Map([...varied, ...unique].map((place) => [place.id, place])).values()].slice(0, limit);
}
function straightLineKm(a: Coordinates, b: Coordinates) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function mapNearbyPlaces(data: z.infer<typeof placesResponseSchema>, origin: Coordinates, request: NearbySearch, limit = 8): NearbyResult {
  const preferred = preferredPlaceTypes(request);
  const excluded = excludedPlaceTypes(request);
  const places = data.places.filter((place) => place.businessStatus === "OPERATIONAL")
    .filter((place) => !place.types.some((type) => excluded.has(type)))
    .filter((place) => request.includeFood && !request.avoidRestaurants || !place.types.some((type) => ["restaurant", "cafe", "meal_takeaway", "meal_delivery"].includes(type)))
    .map((place, providerIndex) => {
      const distanceKm = straightLineKm(origin, { lat: place.location.latitude, lng: place.location.longitude });
      const fit = place.types.reduce((best, type) => Math.max(best, preferred.includes(type) ? preferred.length - preferred.indexOf(type) : 0), 0);
      const category = place.primaryTypeDisplayName?.text || "Place to explore";
      const map = new URL("https://www.google.com/maps/search/");
      map.searchParams.set("api", "1"); map.searchParams.set("query", place.displayName.text); map.searchParams.set("query_place_id", place.id);
      const group = place.types.some((type) => ["art_gallery", "museum"].includes(type)) ? "art" : place.types.some((type) => ["restaurant", "cafe"].includes(type)) ? "dining" : place.types.includes("park") ? "nature" : "entertainment";
      return { fit, distanceKm, group, providerIndex, eligible: !request.date || fitsVenueRequest(place, request, distanceKm), place: {
        id: place.id, name: place.displayName.text, address: place.formattedAddress, category, distanceKm: Math.round(distanceKm * 10) / 10,
        reason: `${category} in ${request.locationScope === "city" ? request.city : `${request.area}, ${request.city}`}${place.types.some((type) => ["art_gallery", "museum"].includes(type)) && preferred.includes("art_gallery") ? ", for your creative side" : ""}.`,
        mapsUrl: map.toString(), attributions: place.attributions.flatMap((item) => {
          if (!item.provider) return [];
          const url = z.url({ protocol: /^https$/ }).safeParse(item.providerUri);
          return [{ name: item.provider, ...(url.success ? { url: url.data } : {}) }];
        }),
        details: { checkedAt: new Date().toISOString(), opening: venueOpeningStatus(place, request.date, timeMinutes(request.startTime) + travelEstimate(distanceKm, request.transport), Math.max(30, request.duration - travelEstimate(distanceKm, request.transport) * 2)) === "fits" ? "fits" as const : "unknown" as const, hours: place.regularOpeningHours?.weekdayDescriptions ?? [], timeZone: place.timeZone?.id, rating: place.rating, reviewCount: place.userRatingCount, price: providerPrice(place), travelMinutes: travelEstimate(distanceKm, request.transport), reviews: [] },
      } };
    }).filter((item) => item.eligible && item.distanceKm <= Math.min(request.maxDistance, 50))
    .sort((a, b) => b.fit - a.fit || (request.locationScope === "city" ? a.providerIndex - b.providerIndex : a.distanceKm - b.distanceKm));
  const groups = new Set<string>();
  const varied = places.filter((item) => { if (groups.has(item.group)) return false; groups.add(item.group); return true; });
  return { area: request.area, city: request.city, country: request.country, places: [...new Map([...varied, ...places].map((item) => [item.place.id, item.place])).values()].slice(0, Math.min(24, Math.max(1, limit))) };
}
