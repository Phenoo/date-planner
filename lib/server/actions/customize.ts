import { planningOrigin } from "@/lib/maps/google";
import { z } from "zod";
import { requestSchema } from "@/lib/planner/schema";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson } from "@/lib/planner/http";
const editSchema = z.object({
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
    return Response.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
