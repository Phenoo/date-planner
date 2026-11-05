import { hasQualifyingGoogleRating } from "../maps/recommendation-quality";

type CatalogPlace = { placeId?: string; demo: boolean };
type GoogleVenueRating = { rating?: number; operational: boolean };

export async function catalogExperiencesMeetRatingRequirement(
  experiences: readonly CatalogPlace[],
  lookup: (placeId: string) => Promise<GoogleVenueRating>,
  demoMode = false,
): Promise<boolean> {
  if (!experiences.length || experiences.length > 4) return false;
  if (demoMode && experiences.every((experience) => experience.demo)) return true;
  const ids = experiences.flatMap(({ placeId }) => placeId?.trim() ? [placeId] : []);
  if (ids.length !== experiences.length) return false;
  try {
    const places = await Promise.all([...new Set(ids)].map(lookup));
    return places.every((place) => place.operational && hasQualifyingGoogleRating(place.rating));
  } catch {
    return false;
  }
}
