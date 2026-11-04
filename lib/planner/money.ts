import { savedRecipeSchema, type SavedRecipe } from "./saved";
import { experienceSchema, requestSchema, type Experience, type DatePlan, type PlanRequest } from "./schema";
import { fromMinorUnits, toMinorUnits, validCurrency } from "./currency";
export function toKobo(naira: number) {
  const value = Math.round(naira * 100);
  if (!Number.isFinite(naira) || naira < 0 || !Number.isSafeInteger(value)) throw new Error("Invalid monetary amount.");
  return value;
}
export function fromKobo(kobo: number) {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new Error("Invalid kobo amount.");
  return kobo / 100;
}
const storedRequest = (request: PlanRequest) => ({ ...request, budget: request.budget === null ? null : toMinorUnits(request.budget, request.currency), transportBudget: request.transportBudget === null ? null : toMinorUnits(request.transportBudget, request.currency) });
const moneyUnit = (currency: string) => currency === "NGN" ? "NGN_KOBO" : "CURRENCY_MINOR";
const storedMinor = (value: object) => "moneyUnit" in value && (value.moneyUnit === "NGN_KOBO" || value.moneyUnit === "CURRENCY_MINOR");
function storedCurrency(value: object) {
  if ("moneyUnit" in value && value.moneyUnit === "NGN_KOBO") return "NGN";
  if ("currency" in value && typeof value.currency === "string" && validCurrency(value.currency)) return value.currency;
  throw new Error("Stored currency is missing.");
}
function restoredRequest(value: unknown, currency: string) {
  if (!value || typeof value !== "object" || !("budget" in value) || value.budget !== null && typeof value.budget !== "number") throw new Error("Stored spending limit is invalid.");
  const transportBudget = "transportBudget" in value ? value.transportBudget : null;
  if (transportBudget !== null && typeof transportBudget !== "number") throw new Error("Stored transport amount is invalid.");
  return { ...value, currency, budget: value.budget === null ? null : fromMinorUnits(value.budget, currency), transportBudget: transportBudget === null ? null : fromMinorUnits(transportBudget, currency) };
}
export function encodeRecipe(recipe: SavedRecipe) { const currency = recipe.request.currency; return { ...recipe, currency, moneyUnit: moneyUnit(currency), total: toMinorUnits(recipe.total, currency), request: storedRequest(recipe.request) }; }
export function decodeRecipe(value: unknown) {
  if (!value || typeof value !== "object") return savedRecipeSchema.safeParse(value);
  if (!storedMinor(value)) return savedRecipeSchema.safeParse(value);
  if (!("total" in value) || typeof value.total !== "number" || !("request" in value) || !value.request || typeof value.request !== "object" || !("budget" in value.request) || (typeof value.request.budget !== "number" && value.request.budget !== null)) return savedRecipeSchema.safeParse(null);
  try { const currency = storedCurrency(value); return savedRecipeSchema.safeParse({ ...value, total: fromMinorUnits(value.total, currency), request: restoredRequest(value.request, currency) }); } catch { return savedRecipeSchema.safeParse(null); }
}
export function encodeExperience(experience: Experience) { return { ...experience, price: toMinorUnits(experience.price, experience.currency), moneyUnit: moneyUnit(experience.currency) }; }
export function decodeExperience(value: unknown) {
  if (value && typeof value === "object" && storedMinor(value) && "price" in value && typeof value.price === "number") {
    try { const currency = storedCurrency(value); return experienceSchema.safeParse({ ...value, currency, price: fromMinorUnits(value.price, currency) }); } catch { return experienceSchema.safeParse(null); }
  }
  return experienceSchema.safeParse(value);
}
export function encodePlan(plan: DatePlan) {
  const currency = plan.request.currency;
  const minor = (amount: number) => toMinorUnits(amount, currency);
  return { ...plan, currency, moneyUnit: moneyUnit(currency), request: storedRequest(plan.request),
    activityCost: minor(plan.activityCost), transportCost: minor(plan.transportCost), contingencyCost: minor(plan.contingencyCost),
    total: minor(plan.total), remaining: plan.remaining === null ? null : minor(plan.remaining), budget: plan.budget === null ? null : minor(plan.budget),
    activities: plan.activities.map((activity) => ({ ...activity, cost: minor(activity.cost), experience: encodeExperience(activity.experience) })),
  };
}
export function decodePlanRequest(value: unknown) {
  if (!value || typeof value !== "object" || !("request" in value)) return requestSchema.safeParse(null);
  const request = value.request;
  if (storedMinor(value)) {
    try { return requestSchema.safeParse(restoredRequest(request, storedCurrency(value))); } catch { return requestSchema.safeParse(null); }
  }
  return requestSchema.safeParse(request);
}
