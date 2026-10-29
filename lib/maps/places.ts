import "server-only";
import { geocodeLocation, mapsServerKey } from "./google";
import { discoveryQuery } from "./location";
import { placePhoto } from "./photos";
import { mapNearbyPlaces, placesResponseSchema, placeTypeGroups } from "./nearby";
import type { Coordinates, NearbySearch } from "./schema";
import { RequestError } from "@/lib/planner/http";

type PlaceRecord = ReturnType<typeof placesResponseSchema.parse>["places"][number];
type SearchOptions = { queries?: string[]; excludeIds?: readonly string[]; signal?: AbortSignal; limit?: number };
const fields = "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.location,places.types,places.businessStatus,places.attributions,places.photos";

export async function loadPlaceCandidates(request: NearbySearch, center?: Coordinates, options: SearchOptions = {}) {
  const origin = center ?? (await geocodeLocation(discoveryQuery(request))).results[0]?.geometry?.location;
  if (!origin) throw new RequestError("Choose an area to find nearby places.", 422);
  const groups = placeTypeGroups(request);
  const circle = { center: { latitude: origin.lat, longitude: origin.lng }, radius: Math.min(request.maxDistance, 50) * 1000 };
  const nearbyGroups = options.queries?.length
    ? [groups.find((group) => group.includes("restaurant")) ?? [], groups.filter((group) => !group.some((type) => ["art_gallery", "museum", "restaurant", "cafe"].includes(type))).flat()].filter((group) => group.length)
    : groups;
  const searches = [
    ...(options.queries ?? []).slice(0, 2).map((query) => ({ method: "searchText", body: { textQuery: `${query} in ${discoveryQuery(request)}`, pageSize: 10, languageCode: "en", locationBias: { circle }, includePureServiceAreaBusinesses: false } })),
    ...nearbyGroups.map((includedTypes) => ({ method: "searchNearby", body: { includedTypes, maxResultCount: 10, rankPreference: request.locationScope === "city" ? "POPULARITY" : "DISTANCE", languageCode: "en", locationRestriction: { circle } } })),
  ];
  if (!searches.length) return { result: mapNearbyPlaces({ places: [] }, origin, request, options.limit ?? 8), records: [] };
  const results = await Promise.allSettled(searches.map(async (search) => {
  const response = await fetch(`https://places.googleapis.com/v1/places:${search.method}`, {
    method: "POST", cache: "no-store", signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": mapsServerKey(), "X-Goog-FieldMask": fields },
    body: JSON.stringify(search.body),
  });
  if (!response.ok) throw new RequestError("Nearby places couldn't be loaded from Google Maps. Please try again shortly.", 503);
  const data = placesResponseSchema.safeParse(await response.json());
  if (!data.success) throw new RequestError("Nearby place information is temporarily unavailable.", 503);
  return data.data.places;
  }));
  options.signal?.throwIfAborted();
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  if (!fulfilled.length) throw new RequestError("Nearby places couldn't be loaded from Google Maps. Please try again shortly.", 503);
  const records = fulfilled.flatMap((result) => result.value).filter((record) => !options.excludeIds?.includes(record.id));
  const result = mapNearbyPlaces({ places: records }, origin, request, options.limit ?? 8);
  if (fulfilled.length < searches.length) result.warnings = ["Some place searches were unavailable. These are the options we could confirm from Google Maps."];
  return { result, records };
}

export async function attachPlacePhotos(result: Awaited<ReturnType<typeof loadPlaceCandidates>>["result"], records: PlaceRecord[]) {
  const photos = await Promise.allSettled(result.places.map((place) => placePhoto(records.find((record) => record.id === place.id && record.photos.length)?.photos[0])));
  return { ...result, places: result.places.map((place, index) => {
    const photo = photos[index];
    return photo?.status === "fulfilled" && photo.value ? { ...place, photo: photo.value } : place;
  }) };
}

export async function nearbyPlaces(request: NearbySearch, center?: Coordinates) {
  const { result, records } = await loadPlaceCandidates(request, center, { limit: 3 });
  return attachPlacePhotos(result, records);
}
