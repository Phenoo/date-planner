import { planningOrigin } from "@/lib/maps/google";
import { persistPlans, ownedPlanRequest } from "@/lib/server/plan-persistence";
import { z } from "zod";
import { generateSchema } from "@/lib/planner/schema";
import { interpretModification, personalize } from "@/lib/planner/ai";
import { generatePlans } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

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
    const result = await personalize(
      generatePlans(
        {
          ...parsed.data,
          request: modification.request,
          mode: modification.mode,
        },
        await getCatalog(),
        undefined,
        await planningOrigin(modification.request),
      ),
    );
    await persistPlans(request, result.plans);
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
