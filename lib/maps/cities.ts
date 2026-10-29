import { z } from "zod";
import { coordinatesSchema, type Coordinates } from "./schema";

export const citySearchSchema = z.object({
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
});
export const cityRecordSchema = z.tuple([z.string(), z.string(), z.string().length(2), z.number(), z.number()]);
export type CityRecord = z.infer<typeof cityRecordSchema>;
export const citySuggestionsSchema = z.object({
  city: z.string(),
  cities: z.array(z.object({ id: z.string(), name: z.string().min(2).max(80), distanceKm: z.number().nonnegative() })).max(6),
});
export type CitySuggestions = z.infer<typeof citySuggestionsSchema>;

export function nearbyCities(records: readonly CityRecord[], origin: Coordinates, city: string, countryCode: string, aliases: readonly string[] = []): CitySuggestions {
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  const excluded = new Set([city, ...aliases].map(normalize));
  const seen = new Set<string>();
  const candidates = records.flatMap(([id, name, country, lat, lng]) => {
    if (country !== countryCode || excluded.has(normalize(name))) return [];
    const coordinate = coordinatesSchema.safeParse({ lat, lng });
    if (!coordinate.success) return [];
    const rad = Math.PI / 180;
    const h = Math.sin((lat - origin.lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(origin.lat * rad) * Math.sin((lng - origin.lng) * rad / 2) ** 2;
    const distance = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    // Keep expanded destinations outside the immediate metro area, within a regional getaway's reach.
    return distance >= 25 && distance <= 250 ? [{ id, name, distanceKm: Math.round(distance) }] : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm).filter(({ name }) => {
    const key = normalize(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
  return { city, cities: candidates };
}
