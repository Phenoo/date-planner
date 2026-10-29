import { planningOrigin } from "@/lib/maps/google";
import { savedRecipeSchema } from "@/lib/planner/saved";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { getCatalog } from "@/lib/planner/catalog";
import { apiError, readJson } from "@/lib/planner/http";
export async function restore(request: Request) {
  try {
    const parsed = savedRecipeSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return Response.json(
        { error: "This saved plan is invalid or outdated." },
        { status: 400 },
      );
    const catalog = await getCatalog();
    const origin = await planningOrigin(parsed.data.request);
    const experiences = parsed.data.experienceIds.map((id) =>
      catalog.find((item) => item.id === id),
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
            "This plan no longer fits the current catalog or budget. Please create a fresh plan.",
        },
        { status: 409 },
      );
    return Response.json({
      plans: [{ ...plan, title: parsed.data.title, type: parsed.data.type }],
      warnings: [
        plan.demo
          ? "Demo mode: fictional venues and sample prices. Not available for real-world bookings."
          : "This plan has been recalculated with current catalog information. Confirm availability before visiting.",
      ],
      diagnostics: [],
      source: plan.demo ? "demo" : "firebase",
      ai: false,
    });
  } catch (error) {
    return apiError(error);
  }
}
