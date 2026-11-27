import type { NearbyResult } from "./schema";

export const discoveryCategories = ["For you", "Dinner", "Playful", "Slow days"] as const;
export type DiscoveryCategory = typeof discoveryCategories[number];
type Place = NearbyResult["places"][number];
const searchText = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

export function filterDiscoveryPlaces(places: readonly Place[], { category, query, radius }: { category: DiscoveryCategory; query: string; radius: number }) {
  const term = searchText(query.trim());
  return places.filter(place => {
    if (place.distanceKm > radius) return false;
    const text = searchText(`${place.name} ${place.category} ${place.address}`);
    if (term && !text.includes(term)) return false;
    if (category === "Dinner") return /\b(?:restaurants?|dining|bistros?|grills?|lounges?|bars?|food)\b/.test(text);
    if (category === "Playful") return /\b(?:games?|arcades?|bowling|cinemas?|theat(?:er|re)s?|arts?|galler(?:y|ies)|museums?|pottery|studios?|adventure|entertainment)\b/.test(text);
    if (category === "Slow days") return /\b(?:caf[eé]s?|coffee|tea|parks?|gardens?|beaches?|nature|books?)\b/.test(text);
    return true;
  });
}
