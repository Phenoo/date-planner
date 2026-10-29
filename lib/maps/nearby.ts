import { z } from "zod";
import type { Coordinates, NearbyResult, NearbySearch } from "./schema";

export const placesResponseSchema = z.object({
  places: z.array(z.object({
    id: z.string(), displayName: z.object({ text: z.string() }), formattedAddress: z.string().default(""),
    primaryTypeDisplayName: z.object({ text: z.string() }).optional(), types: z.array(z.string()).default([]), businessStatus: z.string().optional(),
    location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
    attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).default([]),
    photos: z.array(z.object({ name: z.string(), authorAttributions: z.array(z.object({ displayName: z.string(), uri: z.string().optional() })).default([]) })).default([]),
  })).default([]),
});
export function preferredPlaceTypes(request: NearbySearch) {
  const types = new Set<string>();
  const interests = request.interests.toLowerCase();
  if (request.vibes.includes("Creative") || /art|gallery|museum|pottery/.test(interests)) { types.add("art_gallery"); types.add("museum"); }
  if (request.vibes.some((vibe) => ["Outdoors", "Relaxed", "Adventurous", "Active"].includes(vibe)) || /nature|park|walk/.test(interests)) types.add("park");
  if (request.vibes.some((vibe) => ["Playful", "Entertainment"].includes(vibe)) || /movie|cinema|game/.test(interests)) { types.add("movie_theater"); types.add("bowling_alley"); }
  if (request.includeFood && !request.avoidRestaurants) { types.add("restaurant"); types.add("cafe"); }
  if (!types.size) { types.add("art_gallery"); types.add("museum"); types.add("park"); }
  return [...types];
}
function straightLineKm(a: Coordinates, b: Coordinates) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function mapNearbyPlaces(data: z.infer<typeof placesResponseSchema>, origin: Coordinates, request: NearbySearch, limit = 8): NearbyResult {
  const preferred = preferredPlaceTypes(request);
  const places = data.places.filter((place) => place.businessStatus === "OPERATIONAL")
    .filter((place) => request.includeFood && !request.avoidRestaurants || !place.types.some((type) => ["restaurant", "cafe", "meal_takeaway", "meal_delivery"].includes(type)))
    .map((place, providerIndex) => {
      const distanceKm = straightLineKm(origin, { lat: place.location.latitude, lng: place.location.longitude });
      const fit = place.types.reduce((best, type) => Math.max(best, preferred.includes(type) ? preferred.length - preferred.indexOf(type) : 0), 0);
      const category = place.primaryTypeDisplayName?.text || "Place to explore";
      const map = new URL("https://www.google.com/maps/search/");
      map.searchParams.set("api", "1"); map.searchParams.set("query", place.displayName.text); map.searchParams.set("query_place_id", place.id);
      const group = place.types.some((type) => ["art_gallery", "museum"].includes(type)) ? "art" : place.types.some((type) => ["restaurant", "cafe"].includes(type)) ? "dining" : place.types.includes("park") ? "nature" : "entertainment";
      return { fit, distanceKm, group, providerIndex, place: {
        id: place.id, name: place.displayName.text, address: place.formattedAddress, category, distanceKm: Math.round(distanceKm * 10) / 10,
        reason: `${category} in ${request.locationScope === "city" ? request.city : `${request.area}, ${request.city}`}${place.types.some((type) => ["art_gallery", "museum"].includes(type)) && preferred.includes("art_gallery") ? ", for your creative side" : ""}.`,
        mapsUrl: map.toString(), attributions: place.attributions.flatMap((item) => {
          if (!item.provider) return [];
          const url = z.url({ protocol: /^https$/ }).safeParse(item.providerUri);
          return [{ name: item.provider, ...(url.success ? { url: url.data } : {}) }];
        }),
      } };
    }).filter((item) => item.distanceKm <= Math.min(request.maxDistance, 50))
    .sort((a, b) => b.fit - a.fit || (request.locationScope === "city" ? a.providerIndex - b.providerIndex : a.distanceKm - b.distanceKm));
  const groups = new Set<string>();
  const varied = places.filter((item) => { if (groups.has(item.group)) return false; groups.add(item.group); return true; });
  return { area: request.area, city: request.city, country: request.country, places: [...new Map([...varied, ...places].map((item) => [item.place.id, item.place])).values()].slice(0, Math.min(24, Math.max(1, limit))) };
}
