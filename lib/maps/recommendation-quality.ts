export const minimumGoogleRating = 3.75;

export function hasQualifyingGoogleRating(rating: unknown): boolean {
  return typeof rating === "number" && Number.isFinite(rating) && rating > minimumGoogleRating && rating <= 5;
}
