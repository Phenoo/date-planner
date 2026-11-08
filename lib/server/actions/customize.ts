import { scheduleError } from "@/lib/planner/schedule";
import { planningOrigin } from "@/lib/maps/google";
import { z } from "zod";
import { requestSchema } from "@/lib/planner/schema";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson } from "@/lib/planner/http";
import { planHasQualifyingGoogleRatings } from "@/lib/server/plan-ratings";
import { requireOwnedActivities } from "@/lib/server/membership-usage";
import { persistPlans } from "@/lib/server/plan-persistence";
import { membershipTestEnabled } from "@/lib/server/membership-config";
const editSchema = z.object({
  planId: z.string().min(1).max(500).optional(),
  request: requestSchema,
  experienceIds: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(4)
    .refine((ids) => new Set(ids).size === ids.length),
});
export async function customize(request: Request) {
  try {
    const parsed = editSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json(
        {
          error: "Choose one to four different activities to update your plan.",
        },
        { status: 400 },
      );
    const invalidSchedule = scheduleError(parsed.data.request);
    if (invalidSchedule) return Response.json({ error: invalidSchedule }, { status: 400 });
    await requireOwnedActivities(request, parsed.data.planId, parsed.data.experienceIds);
    const catalog = await getCatalog();
    const origin = await planningOrigin(parsed.data.request);
    const experiences = parsed.data.experienceIds.map((id) =>
      catalog.find((item) => item.id === id),
    );
    if (experiences.some((item) => !item))
      return Response.json(
        {
          error:
            "The catalog has changed. Regenerate your plan to use current experiences.",
        },
        { status: 409 },
      );
    const plan = experiences.every((item) => item !== undefined)
      ? recalculateExactPlan(
          parsed.data.request,
          experiences,
          undefined,
          catalog,
          origin,
        )
      : null;
    if (!plan)
      return Response.json(
        {
          error:
            "That change doesn't fit your budget, opening hours, or required preferences. Try another order, keep a food stop if food is included, or adjust your preferences.",
        },
        { status: 422 },
      );
    if (!await planHasQualifyingGoogleRatings(plan))
      return Response.json({ error: "This plan no longer has a confirmed Google average rating above 3.75 stars. Please find another recommendation." }, { status: 409 });
    if (membershipTestEnabled()) await persistPlans(request, [plan]);
    return Response.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
