import "server-only";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { catalogExperiencesMeetRatingRequirement } from "@/lib/planner/catalog-ratings";
import type { DatePlan, Experience } from "@/lib/planner/schema";

export function experiencesHaveQualifyingGoogleRatings(experiences: readonly Experience[]): Promise<boolean> {
  return catalogExperiencesMeetRatingRequirement(experiences, async (id) => {
    const { record, operational } = await loadPlaceDetails(id, false);
    return { rating: record.rating, operational };
  }, process.env.DATE_ATLAS_CATALOG_MODE === "demo");
}

export function planHasQualifyingGoogleRatings(plan: DatePlan): Promise<boolean> {
  return experiencesHaveQualifyingGoogleRatings(plan.activities.map((activity) => activity.experience));
}
