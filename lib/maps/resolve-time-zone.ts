import 'server-only';
import { z } from 'zod';
import { cityTimeZone } from './destination-time-zone';
import { geocodeLocation, mapsServerKey } from './google';
import { locationFromGeocode } from "./location";
import type { PlanRequest } from "@/lib/planner/schema";
import { RequestError } from "@/lib/planner/http";
import { validTimeZone } from '@/lib/planner/schedule';

export async function destinationTimeZone(city: string, country: string) {
  const known = cityTimeZone(city, country);
  if (known && validTimeZone(known)) return known;
  try {
    const geocode = await geocodeLocation(`${city}, ${country}`);
    const canonical = locationFromGeocode(geocode);
    const canonicalZone = canonical ? cityTimeZone(canonical.location.city, canonical.location.country) : null;
    if (canonicalZone && validTimeZone(canonicalZone)) return canonicalZone;
    const id = geocode.results[0]?.place_id;
    if (!id) return null;
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { 'X-Goog-Api-Key': mapsServerKey(), 'X-Goog-FieldMask': 'timeZone' } });
    if (!response.ok) return null;
    const result = z.object({ timeZone: z.object({ id: z.string().refine(validTimeZone) }) }).safeParse(await response.json());
    return result.success ? result.data.timeZone.id : null;
  } catch { return null; }
}

export async function resolvePlanningTimeZone(request: PlanRequest): Promise<PlanRequest> {
  if (request.timeZoneConfirmed) return request;
  const zone = await destinationTimeZone(request.city, request.country);
  if (!zone) throw new RequestError("We couldn’t confirm this destination. Check the city and country, then try again.", 503);
  return { ...request, timeZone: zone, timeZoneConfirmed: true };
}
