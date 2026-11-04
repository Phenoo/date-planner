import 'server-only';
import { z } from 'zod';
import { cityTimeZone } from './destination-time-zone';
import { geocodeLocation, mapsServerKey } from './google';
import { validTimeZone } from '@/lib/planner/schedule';

export async function destinationTimeZone(city: string, country: string) {
  const known = cityTimeZone(city, country);
  if (known && validTimeZone(known)) return known;
  try {
    const geocode = await geocodeLocation(`${city}, ${country}`);
    const id = geocode.results[0]?.place_id;
    if (!id) return null;
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { 'X-Goog-Api-Key': mapsServerKey(), 'X-Goog-FieldMask': 'timeZone' } });
    if (!response.ok) return null;
    const result = z.object({ timeZone: z.object({ id: z.string().refine(validTimeZone) }) }).safeParse(await response.json());
    return result.success ? result.data.timeZone.id : null;
  } catch { return null; }
}
