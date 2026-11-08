import { scheduleError } from "@/lib/planner/schedule";
import { planningOrigin } from "@/lib/maps/google";
import { z } from "zod";
import { requestSchema, generateSchema } from "@/lib/planner/schema";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { planHasQualifyingGoogleRatings } from "@/lib/server/plan-ratings";
import { requireOwnedActivities } from "@/lib/server/membership-usage";
import { membershipTestEnabled } from "@/lib/server/membership-config";
import { coordinateGeneration } from "@/lib/server/generation-coordinator";
import { persistPlans } from "@/lib/server/plan-persistence";
import { recommendationResultSchema } from "@/lib/planner/response-schema";
const swapSchema = z.object({
  planId: z.string().min(1).max(500).optional(),
  request: requestSchema,
  excludeIds: generateSchema.shape.excludeIds,
  excludeCategories: generateSchema.shape.excludeCategories,
  experienceIds: z.array(z.string()).min(1).max(4),
  index: z.number().int().min(0).max(3),
});
export async function swap(request: Request) {
  try {
    const parsed = swapSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json(
        { error: "Please choose an activity to replace." },
        { status: 400 },
      );
    const { request: preferences, experienceIds, index } = parsed.data;
    if (index >= experienceIds.length)
      return Response.json(
        { error: "That activity no longer exists." },
        { status: 400 },
      );
    const invalidSchedule = scheduleError(parsed.data.request);
    if (invalidSchedule) return Response.json({ error: invalidSchedule }, { status: 400 });
    await requireOwnedActivities(request, parsed.data.planId, experienceIds);
    const findAlternatives = async (signal?: AbortSignal) => {
      const catalog = await getCatalog();
      const origin = await planningOrigin(preferences);
      const existing = experienceIds.map((id) =>
        catalog.find((item) => item.id === id),
      );
      if (existing.some((item) => !item))
        throw new RequestError("The catalog has changed. Please regenerate this plan.", 409);
      const alternatives = catalog
        .filter((item) => !experienceIds.includes(item.id) && !parsed.data.excludeIds.includes(item.id) && !parsed.data.excludeCategories.some((category) => category.toLowerCase() === item.category.toLowerCase()))
        .flatMap((replacement) => {
          const experiences = existing.flatMap((item, position) =>
            position === index ? [replacement] : item ? [item] : [],
          );
          const plan = recalculateExactPlan(
            preferences,
            experiences,
            undefined,
            catalog,
            origin,
          );
          return plan ? [plan] : [];
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 1);
      const ratingChecks = await Promise.all(alternatives.map(planHasQualifyingGoogleRatings));
      const plans = alternatives.filter((_, index) => ratingChecks[index]);
      signal?.throwIfAborted();
      if (membershipTestEnabled()) await persistPlans(request, plans);
      return plans;
    };
    if (membershipTestEnabled() && parsed.data.planId) {
      const input = generateSchema.parse({ request: preferences, excludeIds: parsed.data.excludeIds, excludeCategories: parsed.data.excludeCategories, replacementOf: { kind: "plan", id: parsed.data.planId }, variation: index });
      const response = await coordinateGeneration(request, input, async (signal) => ({ plans: await findAlternatives(signal), warnings: [], diagnostics: [], source: "firebase", ai: false }));
      if (response.status === 202) return Response.json({ error: "Your alternative is already being prepared. Please retry shortly." }, { status: 409 });
      const result = recommendationResultSchema.parse(await response.json());
      return Response.json({ alternatives: result.plans }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ alternatives: await findAlternatives() });
  } catch (error) {
    return apiError(error);
  }
}
