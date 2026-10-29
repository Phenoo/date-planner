import "server-only";
import { createDiscoveryBrief, rankDiscoveredPlaces, type DiscoveryOptions } from "@/lib/planner/discovery-ai";
import { attachPlacePhotos, loadPlaceCandidates } from "@/lib/maps/places";
import type { Coordinates } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { fitsVenueRequest, providerPrice, travelEstimate, venueOpeningStatus } from "@/lib/maps/venue-facts";
import { timeMinutes } from "@/lib/planner/schedule";
import { z } from "zod";

export async function discoverDatePlaces(request: PlanRequest, center: Coordinates | undefined, options: DiscoveryOptions = {}, progress?: (stage: string) => void) {
  progress?.("Understanding your kind of date");
  const brief = await createDiscoveryBrief(request, options);
  progress?.("Finding real places for your date");
  const { result, records } = await loadPlaceCandidates(request, center, { queries: brief?.queries, excludeIds: options.excludePlaceIds, signal: options.signal, limit: 24 });
  progress?.("Matching places to your preferences");
  const ranked = await rankDiscoveredPlaces(result, request, options);
  const chosen = ranked.places[0];
  if (chosen) {
    progress?.("Checking the final details");
    try {
      const { record, operational } = await loadPlaceDetails(chosen.id, false);
      if (!operational || !fitsVenueRequest(record, request, chosen.distanceKm)) return { ...ranked, places: [], warnings: ["That place no longer fits your selected schedule or requirements. Try another time or update your preferences."] };
      const travelMinutes = travelEstimate(chosen.distanceKm, request.transport);
      const opening = venueOpeningStatus(record, request.date, timeMinutes(request.startTime) + travelMinutes, Math.max(30, request.duration - travelMinutes * 2));
      const website = z.url({ protocol: /^https$/ }).safeParse(record.websiteUri);
      chosen.details = {
        checkedAt: new Date().toISOString(), opening: opening === "fits" ? "fits" : "unknown", hours: record.regularOpeningHours?.weekdayDescriptions ?? [],
        ...(record.timeZone ? { timeZone: record.timeZone.id } : {}), rating: record.rating, reviewCount: record.userRatingCount,
        ...(website.success ? { website: website.data } : {}), phone: record.nationalPhoneNumber, price: providerPrice(record), travelMinutes,
        reviews: record.reviews.filter((review) => review.text?.text).slice(0, 5).map((review) => {
          const url = z.url({ protocol: /^https$/ }).safeParse(review.authorAttribution.uri);
          return { author: review.authorAttribution.displayName, ...(url.success ? { url: url.data } : {}), text: review.text!.text, rating: review.rating, when: review.relativePublishTimeDescription };
        }),
      };
    } catch {
      ranked.warnings = [...(ranked.warnings ?? []), "Detailed venue information is temporarily unavailable. Confirm opening hours, prices and booking availability with the venue."];
    }
  }
  const warnings = [...new Set([...(result.warnings ?? []), ...(ranked.warnings ?? [])])];
  return attachPlacePhotos({ ...ranked, warnings }, records);
}
