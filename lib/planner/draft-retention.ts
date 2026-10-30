import { incorporatePreferences } from "./preferences";
import { requestSchema, type PlanRequest } from "./schema";

export const draftLifetimeMs = 60 * 60 * 1000;
export function draftRequest(request: PlanRequest): PlanRequest {
  return { ...incorporatePreferences(request), notes: "", interests: "", dislikes: "", yourGender: "", dateGender: "" };
}
export function draftJSON(value: Record<string, unknown>) {
  const parsed = requestSchema.safeParse(value.request);
  const raw = value.request;
  const request = parsed.success ? draftRequest(parsed.data) : raw && typeof raw === "object" ? { ...raw, notes: "", interests: "", dislikes: "", yourGender: "", dateGender: "" } : undefined;
  const needsPreferenceReview = !!raw && typeof raw === "object" && ["notes", "interests", "dislikes"].some((key) => key in raw && Boolean(Reflect.get(raw, key)));
  const chat = value.chatSession;
  return JSON.stringify({ ...value, ...(request ? { request, needsPreferenceReview } : {}), ...(chat && typeof chat === "object" ? { chatSession: { ...chat, messages: [] } } : {}), expiresAt: Date.now() + draftLifetimeMs });
}
export function draftIsCurrent(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") return false;
  // Older tab drafts acquire a timestamp on their next save; their age is unknown.
  if (!("expiresAt" in value)) return true;
  return typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + draftLifetimeMs;
}
export function clearPlannerDrafts(storage: Pick<Storage, "removeItem">, latestVersion: number) {
  for (let version = 2; version <= latestVersion; version++) storage.removeItem(`date-atlas:planning-draft:v${version}`);
}
