import { z } from "zod";
import { requestSchema, type DatePlan } from "./schema";

export const savedRecipeSchema = z.object({
  id: z.string().max(500),
  title: z.string().max(120),
  type: z.enum([
    "Smart & affordable",
    "Best overall match",
    "Something special",
  ]),
  request: requestSchema,
  experienceIds: z.array(z.string().max(100)).min(1).max(4),
  total: z.number().nonnegative(),
  image: z.string().max(500),
  demo: z.boolean(),
  savedAt: z.string(),
});
export type SavedRecipe = z.infer<typeof savedRecipeSchema>;
export const savedAccountKey = (uid: string) => `date-atlas:saved:account:${uid}:v1`;
export const pendingSaveKey = "date-atlas:pending-save:v1";
export function readPendingPlanAction(raw: string | null, now = Date.now(), flow?: string) {
  try {
    const parsed = z.object({ recipe: savedRecipeSchema, action: z.enum(["save", "share"]).default("save"), flow: z.string().max(100).default("direct"), expiresAt: z.number().finite() }).safeParse(JSON.parse(raw ?? "null"));
    return parsed.success && (flow === undefined || parsed.data.flow === flow) && parsed.data.expiresAt > now && parsed.data.expiresAt <= now + 3600000 ? parsed.data : null;
  } catch { return null; }
}
export function readPendingSave(raw: string | null, now = Date.now()) { return readPendingPlanAction(raw, now)?.recipe ?? null; }
export function toRecipe(plan: DatePlan): SavedRecipe {
  return {
    id: plan.id,
    title: plan.title,
    type: plan.type,
    request: plan.request,
    experienceIds: plan.activities.map((activity) => activity.experience.id),
    total: plan.total,
    image: plan.activities[0].experience.image,
    demo: plan.demo,
    savedAt: new Date().toISOString(),
  };
}
export function parseSaved(value: string | null) {
  if (!value) return [];
  try {
    return z.array(savedRecipeSchema).max(100).parse(JSON.parse(value));
  } catch {
    return [];
  }
}
export function encodeShare(plan: DatePlan) {
  const recipe = toRecipe(plan);
  recipe.request = {
    ...recipe.request,
    notes: "",
    interests: "",
    dislikes: "",
    yourGender: "",
    dateGender: "",
    currentCity: "",
    startingArea: "",
  };
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(recipe))),
  );
}
export function decodeShare(encoded: string) {
  if (encoded.length > 16000) return null;
  try {
    return savedRecipeSchema.parse(
      JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(encoded), (character) =>
            character.charCodeAt(0),
          ),
        ),
      ),
    );
  } catch {
    return null;
  }
}
