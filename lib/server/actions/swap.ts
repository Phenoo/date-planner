import { planningOrigin } from "@/lib/maps/google";
import { z } from "zod";
import { requestSchema } from "@/lib/planner/schema";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson } from "@/lib/planner/http";
const swapSchema = z.object({
  request: requestSchema,
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
    const catalog = await getCatalog();
    const origin = await planningOrigin(preferences);
    const existing = experienceIds.map((id) =>
      catalog.find((item) => item.id === id),
    );
    if (existing.some((item) => !item))
      return Response.json(
        { error: "The catalog has changed. Please regenerate this plan." },
        { status: 409 },
      );
    const alternatives = catalog
      .filter((item) => !experienceIds.includes(item.id))
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
      .slice(0, 8);
    return Response.json({ alternatives });
  } catch (error) {
    return apiError(error);
  }
}
