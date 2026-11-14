import { z } from "zod";
import { activeDiscoveryKey } from "./discovery-session";
import { draftJSON, draftLifetimeMs, draftRequest } from "./draft-retention";
import { chatSessionSchema } from "./intake";
import { plannerDraftVersion, plannerQuestions } from "./questions";
import { requestSchema } from "./schema";
import { savedRecipeSchema, type SavedRecipe } from "./saved";
import { selectedWishlistPlaceSchema } from "./shared-wishlist";

export const activePlanKey = "date-atlas:active-plan:v1";
export const planningContinuationsKey = "date-atlas:planning-continuations:v1";
export type PlanningContinuationOwner = { id: string | null; anonymous: boolean };
type Reader = Pick<Storage, "getItem">;
const flowSchema = z.union([z.literal("direct"), z.uuid()]);
const ownerIdSchema = z.string().min(1).max(128).nullable();
const commonSchema = z.object({ flow: flowSchema, ownerId: ownerIdSchema.optional(), expiresAt: z.number().finite() });
const referenceSchema = commonSchema.extend({ sessionId: z.uuid(), placeId: z.string().min(1).max(200), accepted: z.boolean().default(false) });
const catalogSchema = commonSchema.extend({ recipe: savedRecipeSchema });
const draftSchema = commonSchema.extend({
  request: requestSchema,
  version: z.number().int().nonnegative().optional(),
  step: z.number().int().min(0).max(1000).optional(),
  questionId: z.string().max(100).optional(),
  preferredIds: z.array(z.string().max(100)).max(4).optional(),
  selectedPlace: selectedWishlistPlaceSchema.optional(),
  editingPlan: z.boolean().optional(),
  plannerMode: z.enum(["chat", "steps"]).nullable().optional(),
  chatSession: chatSessionSchema.optional(),
  needsPreferenceReview: z.boolean().optional(),
});

type GoogleReference = Omit<z.infer<typeof referenceSchema>, "ownerId"> & { ownerId: string | null };
export type PlanningContinuation =
  | { source: "google"; flow: string; ownerId: string | null; expiresAt: number; reference: GoogleReference }
  | { source: "catalog"; flow: string; ownerId: string | null; expiresAt: number; recipe: SavedRecipe; accepted: boolean }
  | { source: "draft"; flow: string; ownerId: string | null; expiresAt: number; draft: Record<string, unknown> };

function jsonValue(storage: Reader, key: string): unknown {
  try { return JSON.parse(storage.getItem(key) ?? "null"); } catch { return null; }
}
function matchesOwner(ownerId: string | null | undefined, owner: PlanningContinuationOwner) {
  return typeof ownerId === "string" ? ownerId === owner.id : !owner.id || owner.anonymous;
}
function current(value: z.infer<typeof commonSchema>, owner: PlanningContinuationOwner, now: number) {
  return matchesOwner(value.ownerId, owner) && value.expiresAt > now && value.expiresAt <= now + draftLifetimeMs;
}
function marker(storage: Reader, key: string, id: string, fallback = false) {
  try { return storage.getItem(key) === id; } catch { return fallback; }
}
function google(value: unknown, owner: PlanningContinuationOwner, now: number): PlanningContinuation | null {
  const parsed = referenceSchema.safeParse(value);
  if (!parsed.success || !current(parsed.data, owner, now)) return null;
  const reference = { ...parsed.data, ownerId: parsed.data.ownerId ?? null };
  return { source: "google", flow: reference.flow, ownerId: reference.ownerId, expiresAt: reference.expiresAt, reference };
}
function catalog(value: unknown, owner: PlanningContinuationOwner, now: number, accepted: boolean): PlanningContinuation | null {
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success || !current(parsed.data, owner, now)) return null;
  return { source: "catalog", flow: parsed.data.flow, ownerId: parsed.data.ownerId ?? null, expiresAt: parsed.data.expiresAt, recipe: { ...parsed.data.recipe, title: "Your chosen date", request: draftRequest(parsed.data.recipe.request) }, accepted };
}
function draft(value: unknown, owner: PlanningContinuationOwner, now: number): PlanningContinuation | null {
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success || !current(parsed.data, owner, now)) return null;
  const data = parsed.data;
  const stepProgress = !!data.step && data.step > 0 && (plannerQuestions[data.step]?.id !== "city" || !!data.request.currentCity);
  if (!stepProgress && !data.chatSession?.answered.length && !data.editingPlan && !data.selectedPlace) return null;
  const minimized: unknown = JSON.parse(draftJSON(data));
  if (!minimized || typeof minimized !== "object" || Array.isArray(minimized)) return null;
  const safeDraft = { ...minimized, flow: data.flow, ownerId: data.ownerId ?? null, expiresAt: data.expiresAt, needsPreferenceReview: data.needsPreferenceReview === true || "needsPreferenceReview" in minimized && minimized.needsPreferenceReview === true };
  return { source: "draft", flow: data.flow, ownerId: data.ownerId ?? null, expiresAt: data.expiresAt, draft: safeDraft };
}
function currentContinuations(storage: Reader, owner: PlanningContinuationOwner, now: number) {
  const discovery = google(jsonValue(storage, activeDiscoveryKey), owner, now);
  if (discovery?.source === "google") discovery.reference.accepted = marker(storage, `date-atlas:accepted-pick:${discovery.reference.sessionId}`, discovery.reference.placeId, discovery.reference.accepted);
  const plan = catalog(jsonValue(storage, activePlanKey), owner, now, false);
  if (plan?.source === "catalog") plan.accepted = marker(storage, "date-atlas:accepted-catalog:v1", plan.recipe.id);
  return [discovery, plan, draft(jsonValue(storage, `date-atlas:planning-draft:v${plannerDraftVersion}`), owner, now)].filter((value): value is PlanningContinuation => value !== null);
}
function archivedContinuations(storage: Reader, owner: PlanningContinuationOwner, now: number) {
  const raw = jsonValue(storage, planningContinuationsKey);
  if (!Array.isArray(raw) || raw.length > 5) return [];
  return raw.flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || !("source" in value)) return [];
    const common = commonSchema.safeParse(value);
    if (!common.success || !current(common.data, owner, now)) return [];
    let record: PlanningContinuation | null = null;
    if (value.source === "google" && "reference" in value) {
      record = google(value.reference, owner, now);
      if (record && (record.flow !== common.data.flow || record.ownerId !== (common.data.ownerId ?? null) || record.expiresAt !== common.data.expiresAt)) return [];
    } else if (value.source === "catalog" && "recipe" in value) {
      record = catalog({ ...common.data, recipe: value.recipe }, owner, now, "accepted" in value && value.accepted === true);
    } else if (value.source === "draft" && "draft" in value) {
      record = draft(value.draft, owner, now);
      if (record && (record.flow !== common.data.flow || record.ownerId !== (common.data.ownerId ?? null) || record.expiresAt !== common.data.expiresAt)) return [];
    }
    return record ? [record] : [];
  });
}
function latest(records: PlanningContinuation[], flow?: string) {
  const matching = records.filter(record => flow === undefined || record.flow === flow);
  const results = new Set(matching.filter(record => record.source !== "draft").map(record => record.flow));
  return matching.filter(record => record.source !== "draft" || !results.has(record.flow)).sort((a, b) => b.expiresAt - a.expiresAt)[0] ?? null;
}
export function readPlanningContinuation(storage: Reader, owner: PlanningContinuationOwner, flow?: string, now = Date.now()): PlanningContinuation | null {
  if (flow !== undefined && !flowSchema.safeParse(flow).success) return null;
  return latest([...currentContinuations(storage, owner, now), ...archivedContinuations(storage, owner, now)], flow);
}
export function retainPlanningContinuation(storage: Pick<Storage, "getItem" | "setItem">, owner: PlanningContinuationOwner, flow: string, now = Date.now()): void {
  if (!flowSchema.safeParse(flow).success) return;
  const selected = latest(currentContinuations(storage, owner, now), flow);
  const archive = archivedContinuations(storage, owner, now).filter(record => !selected || record.flow !== selected.flow);
  const records = (selected ? [selected, ...archive] : archive).sort((a, b) => b.expiresAt - a.expiresAt).slice(0, 5);
  try { storage.setItem(planningContinuationsKey, JSON.stringify(records)); } catch { /* Current planning remains usable when browser storage is unavailable. */ }
}
export function clearPlanningContinuations(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(planningContinuationsKey);
}
export function continuationPath(record: PlanningContinuation): "/plan" | `/plan?flow=${string}` {
  return record.flow === "direct" ? "/plan" : `/plan?flow=${encodeURIComponent(record.flow)}`;
}
