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

export const countryCitiesSchema = z.object({
  countries: z.array(z.object({ code: z.string().length(2), name: z.string() })).max(300),
  country: z.object({ code: z.string().length(2), name: z.string() }).nullable(),
  cities: z.array(cityRecordSchema).max(1000),
});
export type CountryCities = z.infer<typeof countryCitiesSchema>;
export const countryCitySearchSchema = z.object({ country: z.string().trim().max(80).default("") });
const normalizeCity = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
function distanceFrom(origin: Coordinates, lat: number, lng: number) {
  const rad = Math.PI / 180;
  const h = Math.sin((lat - origin.lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(origin.lat * rad) * Math.sin((lng - origin.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function citiesForCountry(records: readonly CityRecord[], countryName: string): CountryCities {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = [...new Set(records.map((record) => record[2]))].map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
  const aliases: Record<string, string> = { uk: "GB", usa: "US", "u.s.a.": "US", "united states of america": "US", turkey: "TR", "ivory coast": "CI", "south korea": "KR", "north korea": "KP" };
  const query = normalizeCity(countryName);
  const country = countries.find(({ code, name }) => normalizeCity(name) === query || code.toLowerCase() === query || code === aliases[query]) ?? null;
  return { countries, country, cities: country ? records.filter((record) => record[2] === country.code) : [] };
}

export function manualCitySuggestions(records: readonly CityRecord[], countryCode: string, query: string, origin?: Coordinates) {
  const search = normalizeCity(query);
  const seen = new Set<string>();
  return records.filter(([, name, code, lat, lng]) => code === countryCode && normalizeCity(name).includes(search) && coordinatesSchema.safeParse({ lat, lng }).success)
    .map(([id, name, , lat, lng]) => ({ id, name, ...(origin ? { distanceKm: Math.round(distanceFrom(origin, lat, lng)) } : {}) }))
    .sort((a, b) => Number(normalizeCity(b.name).startsWith(search)) - Number(normalizeCity(a.name).startsWith(search)) || (origin ? (a.distanceKm ?? 0) - (b.distanceKm ?? 0) : 0) || a.name.localeCompare(b.name))
    .filter(({ name }) => { const key = normalizeCity(name); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
}

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
