import type { RecommendationResult } from "./schema";
import { mergeRejectedPicks } from "./discovery-session";

export function recommendationExclusions(result: RecommendationResult | null) {
  const plan = result?.plans[0];
  const experiences = plan?.activities.map((activity) => activity.experience) ?? [];
  return mergeRejectedPicks({
    excludeIds: experiences.map((experience) => experience.id),
    excludePlaceIds: [
      ...(!plan && result?.nearby?.places[0] ? [result.nearby.places[0].id] : []),
      ...experiences.flatMap((experience) => experience.placeId ? [experience.placeId] : []),
    ],
  });
}

export function replacementPreferredIds(preferredIds: readonly string[], excludeIds: readonly string[]) {
  return preferredIds.filter((id) => !excludeIds.includes(id));
}
