import zones from './data/time-zones.json';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const aliases: Record<string, string> = { uk: 'GB', usa: 'US', 'united states of america': 'US', turkey: 'TR', 'south korea': 'KR', uae: 'AE' };
const countries = new Map(Object.keys(zones).map(key => key.slice(0, 2)).flatMap((code): [string, string][] => [[normalize(names.of(code) ?? code), code], [code.toLowerCase(), code]]));
const indexedZones: Record<string, string | null> = zones;
export function cityTimeZone(city: string, country: string) {
  const code = aliases[normalize(country)] ?? countries.get(normalize(country));
  return code ? indexedZones[`${code}:${normalize(city)}`] ?? null : null;
}
