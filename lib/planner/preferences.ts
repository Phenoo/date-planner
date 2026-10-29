import type { PlanRequest } from "./schema";

// Only explicit requirements become hard filters. Free text never expands a spending limit.
export function incorporatePreferences(request: PlanRequest): PlanRequest {
  const text = `${request.interests} ${request.notes}`.toLowerCase();
  const diets = (
    ["vegetarian", "vegan", "halal", "gluten-free"] as const
  ).filter(
    (diet) =>
      text.includes(diet) &&
      !new RegExp(`(?:not|no|isn't|is not)\\s+(?:a\\s+)?${diet}`).test(text),
  );
  return {
    ...request,
    dietary: [...new Set([...request.dietary, ...diets])],
    quiet:
      request.quiet ||
      /\bquiet\b|\bpeaceful\b|(?:dislike|avoid|doesn't (?:like|enjoy)|does not (?:like|enjoy))[^.]*\b(?:noisy|crowded|loud)\b/.test(
        text,
      ),
    avoidRestaurants:
      request.avoidRestaurants ||
      /(?:avoid|without|no|not (?:at|in|going to))[^.]{0,35}\brestaurants?\b/.test(
        text,
      ),
  };
}
