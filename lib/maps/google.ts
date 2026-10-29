import "server-only";
import { geocodeResponseSchema } from "./location";
import type { Coordinates, NearbySearch } from "./schema";
import { RequestError } from "@/lib/planner/http";

export function mapsServerKey() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new RequestError("Maps is temporarily unavailable. You can still choose an area manually.", 503);
  return key;
}
export async function geocodeLocation(input: Coordinates | string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  if (typeof input === "string") url.searchParams.set("address", input);
  else url.searchParams.set("latlng", `${input.lat},${input.lng}`);
  url.searchParams.set("key", mapsServerKey());
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const result = geocodeResponseSchema.safeParse(await response.json());
  if (!response.ok || !result.success || result.data.status !== "OK") throw new RequestError("We couldn't find that area on Maps. Try another neighborhood or choose it manually.", 422);
  return result.data;
}
export async function planningOrigin(request: Pick<NearbySearch, "area" | "city" | "country"> & { startingArea?: string }) {
  if (process.env.DATE_ATLAS_CATALOG_MODE === "demo" || !process.env.GOOGLE_MAPS_SERVER_KEY) return undefined;
  const data = await geocodeLocation(`${request.startingArea || request.area}, ${request.city}, ${request.country}`);
  return data.results[0]?.geometry?.location;
}
