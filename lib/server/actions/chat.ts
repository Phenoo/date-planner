import { scheduleError } from "@/lib/planner/schedule";
import { planningOrigin } from "@/lib/maps/google";
import { persistPlans, ownedPlanRequest } from "@/lib/server/plan-persistence";
import { z } from "zod";
import { generateSchema } from "@/lib/planner/schema";
import { interpretModification, personalize } from "@/lib/planner/ai";
import { generateSinglePlan, recalculateExactPlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { planHasQualifyingGoogleRatings } from "@/lib/server/plan-ratings";
import { membershipTestEnabled } from "@/lib/server/membership-config";
import { ownedMembershipContext } from "@/lib/server/membership-usage";
import { coordinateGeneration } from "@/lib/server/generation-coordinator";
import { recommendationResultSchema } from "@/lib/planner/response-schema";
import type { RecommendationResult } from "@/lib/planner/schema";

const schema = generateSchema.extend({
  message: z.string().trim().min(2).max(1000),
  planId: z.string().max(500).optional(),
});
export async function chat(request: Request, progress?: (stage: string) => void) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json(
        { error: "Please enter a short planning request." },
        { status: 400 },
      );
    let ownedIds: string[] | undefined;
    if (membershipTestEnabled()) {
      if (!parsed.data.planId) throw new RequestError("Reopen your date before asking for another place.", 409);
      ownedIds = await ownedMembershipContext(request, { kind: "plan", id: parsed.data.planId });
    }
    await enforcePlannerLimit(request);
    if (parsed.data.planId) parsed.data.request = await ownedPlanRequest(request, parsed.data.planId);
    progress?.("Interpreting your requested changes");
    const modification = await interpretModification(
      parsed.data.message,
      parsed.data.request,
    );
    if (!modification.understood)
      return Response.json(
        {
          error:
            "Try a change to your budget, food preferences, vibe, travel, or time. You can also edit all preferences in Customize plan.",
        },
        { status: 422 },
      );
    const invalidSchedule = scheduleError(modification.request);
    if (invalidSchedule) return Response.json({ error: invalidSchedule }, { status: 400 });
    const timingFields = new Set(["date", "datePreference", "startTime", "endTime", "duration", "durationMode", "timeZone", "timeZoneConfirmed"]);
    const withoutTiming = (value: typeof parsed.data.request) => JSON.stringify(Object.entries(value).filter(([key]) => !timingFields.has(key)).sort(([left], [right]) => left.localeCompare(right)));
    if (ownedIds && modification.mode === "balanced" && withoutTiming(parsed.data.request) === withoutTiming(modification.request)) {
      const catalog = await getCatalog();
      const experiences = ownedIds.map((id) => catalog.find((item) => item.id === id));
      const plan = experiences.every((item) => item !== undefined) ? recalculateExactPlan(modification.request, experiences, undefined, catalog, await planningOrigin(modification.request)) : null;
      if (!plan || !await planHasQualifyingGoogleRatings(plan)) throw new RequestError("Your place no longer fits this time. Choose another time or request another place.", 409);
      await persistPlans(request, [plan]);
      return Response.json({ plans: [plan], request: modification.request, warnings: [], diagnostics: [], source: "firebase", ai: false, message: "Your time is updated. Your place is kept, and no venue change was used." });
    }
    const build = async (signal?: AbortSignal) => {
      const result = await personalize(
        generateSinglePlan(
          {
            ...parsed.data,
            request: modification.request,
            mode: modification.mode,
          },
          await getCatalog(),
          undefined,
          await planningOrigin(modification.request),
        ), signal,
      );
      const ratingChecks = await Promise.all(result.plans.map(planHasQualifyingGoogleRatings));
      if (ratingChecks.some((eligible) => !eligible)) {
        result.plans = result.plans.filter((_, index) => ratingChecks[index]);
        result.warnings.push("Catalog places without a confirmed Google average rating above 3.75 stars were excluded.");
      }
      signal?.throwIfAborted();
      await persistPlans(request, result.plans);
      return result;
    };
    let result: RecommendationResult;
    if (membershipTestEnabled() && parsed.data.planId) {
      const input = generateSchema.parse({ ...parsed.data, request: modification.request, mode: modification.mode, replacementOf: { kind: "plan", id: parsed.data.planId } });
      const response = await coordinateGeneration(request, input, build);
      if (response.status === 202) throw new RequestError("Your change is already being prepared. Please retry shortly.", 409);
      result = recommendationResultSchema.parse(await response.json());
    } else result = await build();
    return Response.json({
      ...result,
      request: modification.request,
      message: result.plans.length
        ? "I've recalculated the activities, schedule, and spending with your updated preferences. Your spending limit is still respected."
        : "That change leaves no valid plan. Your current itinerary is unchanged. Try editing your preferences or unlocking an activity.",
    });
  } catch (error) {
    return apiError(error);
  }
}
