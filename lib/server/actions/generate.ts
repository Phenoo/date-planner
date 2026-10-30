import { persistPlans } from "@/lib/server/plan-persistence";
import { incorporatePreferences } from "@/lib/planner/preferences";
import { generateSchema } from "@/lib/planner/schema";
import { generateSinglePlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { personalize } from "@/lib/planner/ai";
import { apiError, readJson } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { planningOrigin } from "@/lib/maps/google";
import { discoverDatePlaces } from "@/lib/server/date-discovery";
import { persistDiscoverySession } from "@/lib/server/date-invitations";
import type { Coordinates, NearbyResult } from "@/lib/maps/schema";
import { coordinateGeneration } from "@/lib/server/generation-coordinator";
import { scheduleError } from "@/lib/planner/schedule";

export async function generate(request: Request, progress?: (stage: string) => void) {
  try {
    const parsed = generateSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json(
        {
          error: "Please check your preferences.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    parsed.data.request = incorporatePreferences(parsed.data.request);
    const invalidSchedule = scheduleError(parsed.data.request);
    if (invalidSchedule) return Response.json({ error: invalidSchedule }, { status: 400 });
    const start = parsed.data.request.startTime;
    if (parsed.data.request.endTime && parsed.data.request.endTime <= start)
      return Response.json(
        {
          error: "Ending time must be after the starting time on the same day.",
        },
        { status: 400 },
      );
    return await coordinateGeneration(request, parsed.data, async (signal) => {
      const operationRequest = new Request(request.url, { method: "POST", headers: request.headers, signal });
      await enforcePlannerLimit(operationRequest);
      progress?.("Retrieving verified experiences");
      const catalog = await getCatalog();
      let origin: Coordinates | undefined;
      const mapWarnings: string[] = [];
      try { origin = await planningOrigin(parsed.data.request); }
      catch { mapWarnings.push("Maps couldn't resolve the selected area. Catalog location estimates were used; nearby suggestions are temporarily unavailable."); }
      progress?.("Checking budgets, opening hours, and schedules");
      const candidates = generateSinglePlan(parsed.data, catalog, undefined, origin);
      const discovery = origin && !candidates.plans.length ? discoverDatePlaces(parsed.data.request, !parsed.data.request.startingArea && parsed.data.request.locationScope === "area" ? origin : undefined, {
        excludeCategories: parsed.data.excludeCategories, excludePlaceIds: parsed.data.excludePlaceIds, likedPlaceCategories: parsed.data.likedPlaceCategories, signal,
      }, progress).catch(() => { mapWarnings.push("Google Maps suggestions couldn't be loaded. Please try again or adjust your destination."); return undefined; }) : Promise.resolve(undefined);
      const [result, discovered]: [Awaited<ReturnType<typeof personalize>>, NearbyResult | undefined] = await Promise.all([personalize(candidates, signal), discovery]);
      signal.throwIfAborted();
      const nearby = discovered ? await persistDiscoverySession(operationRequest, discovered, parsed.data.request) : undefined;
      signal.throwIfAborted();
      await persistPlans(operationRequest, result.plans);
      const warnings = !catalog.length && nearby?.places.length
        ? [parsed.data.request.budget === null
          ? "These are live Google Maps suggestions. We need confirmed venue costs and opening hours before building an itinerary. No spending limit has been set."
          : "These are live Google Maps suggestions. We need confirmed venue costs and opening hours before building a budgeted itinerary. Your spending limit has not changed."]
        : result.warnings;
      return { ...result, ai: result.ai || nearby?.ai === true, ...(nearby ? { nearby } : {}), warnings: [...warnings, ...(nearby?.warnings ?? []), ...mapWarnings] };
    });
  } catch (error) {
    return apiError(error);
  }
}
