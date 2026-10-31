import { incorporatePreferences } from "./preferences";
import { requestSchema, type PlanRequest } from "./schema";

export const draftLifetimeMs = 60 * 60 * 1000;
export const plannerModeKey = "date-atlas:planning-style:v1";
export function savedPlannerMode(value: unknown) {
  return value === "chat" || value === "steps" ? value : null;
}
export function draftResumePath(raw: string | null, now = Date.now()) {
  try {
    const draft: unknown = JSON.parse(raw ?? "null");
    if (!draft || typeof draft !== "object" || !draftIsCurrent(draft, now) || !("expiresAt" in draft) || !("request" in draft) || !requestSchema.safeParse(draft.request).success) return null;
    const progressed = "step" in draft && typeof draft.step === "number" && draft.step > 0
      || "chatSession" in draft && !!draft.chatSession && typeof draft.chatSession === "object" && "answered" in draft.chatSession && Array.isArray(draft.chatSession.answered) && draft.chatSession.answered.length > 0;
    if (!progressed) return null;
    return "flow" in draft && typeof draft.flow === "string" && /^[a-f0-9-]{36}$/.test(draft.flow) ? `/plan?flow=${encodeURIComponent(draft.flow)}` : "/plan";
  } catch { return null; }
}
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
