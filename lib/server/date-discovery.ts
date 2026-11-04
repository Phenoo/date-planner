import { venueVisitMinutes } from "@/lib/planner/timing";
import "server-only";
import { createDiscoveryBrief, rankDiscoveredPlaces, type DiscoveryOptions } from "@/lib/planner/discovery-ai";
import { attachPlacePhotos, loadPlaceCandidates } from "@/lib/maps/places";
import type { Coordinates } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { fitsVenueRequest, providerPrice, travelEstimate, venueOpeningStatus } from "@/lib/maps/venue-facts";
import { timeMinutes } from "@/lib/planner/schedule";
import { z } from "zod";
import { RequestError } from "@/lib/planner/http";
import type { NearbyResult } from "@/lib/maps/schema";

export async function discoverDatePlaces(request: PlanRequest, center: Coordinates | undefined, options: DiscoveryOptions = {}, progress?: (stage: string) => void): Promise<NearbyResult> {
  progress?.("Understanding your kind of date");
  const brief = await createDiscoveryBrief(request, options);
  progress?.("Finding real places for your date");
  const { result, records } = await loadPlaceCandidates(request, center, { excludeCategories: options.excludeCategories, queries: brief?.queries, excludeIds: options.excludePlaceIds, signal: options.signal, limit: 24 });
  progress?.("Matching places to your preferences");
  const ranked = await rankDiscoveredPlaces(result, request, options);
  const chosen = ranked.places[0];
  if (chosen) {
    progress?.("Checking the final details");
    try {
      Object.assign(chosen, await refreshDiscoveryPick(chosen, request));
    } catch (error) {
      if (error instanceof RequestError && error.status === 409) return { ...ranked, places: [], searchIssues: ["venue-changed"], warnings: [error.message] };
      ranked.warnings = [...(ranked.warnings ?? []), "Detailed venue information is temporarily unavailable. Confirm opening hours, prices and booking availability with the venue."];
    }
  }
  if (result.places.length && !ranked.places.length) ranked.searchIssues = ["preferences"];
  const warnings = [...new Set([...(result.warnings ?? []), ...(ranked.warnings ?? [])])];
  return attachPlacePhotos({ ...ranked, warnings }, records);
}

export async function refreshDiscoveryPick(pick: Pick<NearbyResult["places"][number], "id" | "distanceKm" | "reason" | "story">, request: PlanRequest, withPhoto = false): Promise<NearbyResult["places"][number]> {
  const { record, operational, place } = await loadPlaceDetails(pick.id, withPhoto);
  if (!operational || !fitsVenueRequest(record, request, pick.distanceKm)) throw new RequestError("This place no longer fits your selected schedule or requirements. Try another time or update your preferences.", 409);
  const travelMinutes = travelEstimate(pick.distanceKm, request.transport);
  const opening = venueOpeningStatus(record, request.date, timeMinutes(request.startTime) + travelMinutes, venueVisitMinutes(request, travelMinutes));
  const website = z.url({ protocol: /^https$/ }).safeParse(record.websiteUri);
  return { ...place, ...pick, details: {
        checkedAt: new Date().toISOString(), opening: opening === "fits" ? "fits" : "unknown", hours: record.regularOpeningHours?.weekdayDescriptions ?? [],
        ...(record.timeZone ? { timeZone: record.timeZone.id } : {}), rating: record.rating, reviewCount: record.userRatingCount,
        ...(website.success ? { website: website.data } : {}), phone: record.nationalPhoneNumber, price: providerPrice(record), travelMinutes,
        reviews: record.reviews.filter((review) => review.text?.text).slice(0, 5).map((review) => {
          const url = z.url({ protocol: /^https$/ }).safeParse(review.authorAttribution.uri);
          return { author: review.authorAttribution.displayName, ...(url.success ? { url: url.data } : {}), text: review.text!.text, rating: review.rating, when: review.relativePublishTimeDescription };
        }),
  } };
}
