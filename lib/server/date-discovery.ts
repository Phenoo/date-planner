import "server-only";
import { createDiscoveryBrief, rankDiscoveredPlaces, type DiscoveryOptions } from "@/lib/planner/discovery-ai";
import { attachPlacePhotos, loadPlaceCandidates } from "@/lib/maps/places";
import type { Coordinates } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";

export async function discoverDatePlaces(request: PlanRequest, center: Coordinates | undefined, options: DiscoveryOptions = {}, progress?: (stage: string) => void) {
  progress?.("Understanding your kind of date");
  const brief = await createDiscoveryBrief(request, options);
  progress?.("Finding real places for your date");
  const { result, records } = await loadPlaceCandidates(request, center, { queries: brief?.queries, excludeIds: options.excludePlaceIds, signal: options.signal, limit: 24 });
  progress?.("Matching places to your preferences");
  const ranked = await rankDiscoveredPlaces(result, request, options);
  const warnings = [...new Set([...(result.warnings ?? []), ...(ranked.warnings ?? [])])];
  return attachPlacePhotos({ ...ranked, warnings }, records);
}
