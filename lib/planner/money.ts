import { savedRecipeSchema, type SavedRecipe } from "./saved";
import { experienceSchema, requestSchema, type Experience, type DatePlan, type PlanRequest } from "./schema";
export function toKobo(naira: number) {
  const value = Math.round(naira * 100);
  if (!Number.isFinite(naira) || naira < 0 || !Number.isSafeInteger(value)) throw new Error("Invalid monetary amount.");
  return value;
}
export function fromKobo(kobo: number) {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new Error("Invalid kobo amount.");
  return kobo / 100;
}
const storedRequest = (request: PlanRequest) => ({ ...request, budget: request.budget === null ? null : toKobo(request.budget) });
export function encodeRecipe(recipe: SavedRecipe) { return { ...recipe, moneyUnit: "NGN_KOBO", total: toKobo(recipe.total), request: storedRequest(recipe.request) }; }
export function decodeRecipe(value: unknown) {
  if (!value || typeof value !== "object") return savedRecipeSchema.safeParse(value);
  if (!("moneyUnit" in value) || value.moneyUnit !== "NGN_KOBO") return savedRecipeSchema.safeParse(value);
  if (!("total" in value) || typeof value.total !== "number" || !("request" in value) || !value.request || typeof value.request !== "object" || !("budget" in value.request) || (typeof value.request.budget !== "number" && value.request.budget !== null)) return savedRecipeSchema.safeParse(null);
  try { return savedRecipeSchema.safeParse({ ...value, total: fromKobo(value.total), request: { ...value.request, budget: value.request.budget === null ? null : fromKobo(value.request.budget) } }); } catch { return savedRecipeSchema.safeParse(null); }
}
export function encodeExperience(experience: Experience) { return { ...experience, price: toKobo(experience.price), moneyUnit: "NGN_KOBO" }; }
export function decodeExperience(value: unknown) {
  if (value && typeof value === "object" && "moneyUnit" in value && value.moneyUnit === "NGN_KOBO" && "price" in value && typeof value.price === "number") {
    try { return experienceSchema.safeParse({ ...value, price: fromKobo(value.price) }); } catch { return experienceSchema.safeParse(null); }
  }
  return experienceSchema.safeParse(value);
}
export function encodePlan(plan: DatePlan) {
  return { ...plan, moneyUnit: "NGN_KOBO", request: storedRequest(plan.request),
    activityCost: toKobo(plan.activityCost), transportCost: toKobo(plan.transportCost), contingencyCost: toKobo(plan.contingencyCost),
    total: toKobo(plan.total), remaining: plan.remaining === null ? null : toKobo(plan.remaining), budget: plan.budget === null ? null : toKobo(plan.budget),
    activities: plan.activities.map((activity) => ({ ...activity, cost: toKobo(activity.cost), experience: encodeExperience(activity.experience) })),
  };
}
export function decodePlanRequest(value: unknown) {
  if (!value || typeof value !== "object" || !("request" in value)) return requestSchema.safeParse(null);
  const request = value.request;
  if ("moneyUnit" in value && value.moneyUnit === "NGN_KOBO" && request && typeof request === "object" && "budget" in request && typeof request.budget === "number") {
    try { return requestSchema.safeParse({ ...request, budget: fromKobo(request.budget) }); } catch { return requestSchema.safeParse(null); }
  }
  return requestSchema.safeParse(request);
}
