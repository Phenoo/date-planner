import type { PlanRequest } from "./schema";
import type { NearbyResult } from "@/lib/maps/schema";
import { validTimeZone } from "./schedule";

const estimatedVisitMinutes = 90;
export function venueVisitMinutes(request: { duration: number; durationMode?: "estimated" | "specified" }, travelMinutes: number) {
  return request.durationMode === "estimated" ? estimatedVisitMinutes : Math.max(30, request.duration - travelMinutes * 2);
}
export function requestForPlace(request: PlanRequest, place?: NearbyResult["places"][number]): PlanRequest {
  const details = place?.details;
  if (!details) return request;
  return { ...request,
    ...(details.timeZone && validTimeZone(details.timeZone) ? { timeZone: details.timeZone, timeZoneConfirmed: true } : {}),
    ...(request.durationMode === "estimated" ? { duration: Math.min(720, estimatedVisitMinutes + Math.max(0, details.travelMinutes) * 2), endTime: "" } : {}),
  };
}
