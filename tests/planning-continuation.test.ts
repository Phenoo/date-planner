import assert from "node:assert/strict";
import test from "node:test";
import { activeDiscoveryKey } from "../lib/planner/discovery-session";
import { draftLifetimeMs } from "../lib/planner/draft-retention";
import { plannerDraftVersion } from "../lib/planner/questions";
import { requestSchema } from "../lib/planner/schema";
import {
  activePlanKey, clearPlanningContinuations, continuationPath, planningContinuationsKey,
  readPlanningContinuation, retainPlanningContinuation, type PlanningContinuationOwner,
} from "../lib/planner/planning-continuation";

const now = 1_000;
const flow = "12345678-1234-4234-8234-123456789abc";
const otherFlow = "12345678-1234-4234-8234-123456789abd";
const sessionId = "12345678-1234-4234-8234-123456789abe";
const owner: PlanningContinuationOwner = { id: "owner-one", anonymous: false };
const guest: PlanningContinuationOwner = { id: "guest-one", anonymous: true };
const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60_000, vibes: ["Romantic"], notes: "PRIVATE NOTE quiet vegetarian", interests: "PRIVATE INTEREST", dislikes: "PRIVATE DISLIKE", yourGender: "man", dateGender: "woman", date: "2026-11-07", startTime: "18:00" });
const draftKey = `date-atlas:planning-draft:v${plannerDraftVersion}`;
const recipe = { id: "catalog-plan", title: "PRIVATE TITLE", type: "Best overall match", request, experienceIds: ["venue-one"], total: 40_000, image: "/venue.jpg", demo: false, savedAt: "2026-11-05T00:00:00Z" };
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function reference(overrides: Record<string, unknown> = {}) {
  return { flow, ownerId: owner.id, sessionId, placeId: "google-venue", expiresAt: now + 10_000, accepted: false, ...overrides };
}

test("an accepted generated place survives Back to home, route eviction and return to its original flow", () => {
  const tab = storage();
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ facts: { name: "UNTRUSTED GOOGLE FACTS" } })));
  tab.setItem(`date-atlas:accepted-pick:${sessionId}`, "google-venue");
  retainPlanningContinuation(tab, owner, flow, now);
  tab.removeItem(activeDiscoveryKey);
  tab.removeItem(`date-atlas:accepted-pick:${sessionId}`);
  const resumed = readPlanningContinuation(tab, owner, undefined, now + 100);
  assert.equal(resumed?.source, "google");
  if (resumed?.source !== "google") return assert.fail("Expected the archived server reference");
  assert.equal(continuationPath(resumed), `/plan?flow=${flow}`);
  assert.equal(resumed.reference.accepted, true);
  assert.equal(resumed.reference.sessionId, sessionId);
  assert.equal(resumed.reference.placeId, "google-venue");
  assert.doesNotMatch(tab.getItem(planningContinuationsKey) ?? "", /UNTRUSTED|facts|PRIVATE/);
});

test("a second plan never replaces the first flow's archived choice", () => {
  const tab = storage();
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference()));
  tab.setItem(`date-atlas:accepted-pick:${sessionId}`, "google-venue");
  retainPlanningContinuation(tab, owner, flow, now);
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ flow: otherFlow, placeId: "second-venue", expiresAt: now + 20_000 })));
  tab.setItem(`date-atlas:accepted-pick:${sessionId}`, "second-venue");
  retainPlanningContinuation(tab, owner, otherFlow, now);
  const first = readPlanningContinuation(tab, owner, flow, now);
  const latest = readPlanningContinuation(tab, owner, undefined, now);
  assert.equal(first?.source === "google" && first.reference.placeId, "google-venue");
  assert.equal(first?.source === "google" && first.reference.accepted, true);
  assert.equal(latest?.flow, otherFlow);
  assert.equal(readPlanningContinuation(tab, owner, "https://external.test", now), null);
});

test("same-flow results outrank newer fallback drafts and current acceptance wins equal-expiry ties", () => {
  const tab = storage();
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference()));
  tab.setItem(`date-atlas:accepted-pick:${sessionId}`, "google-venue");
  retainPlanningContinuation(tab, owner, flow, now);
  tab.setItem(draftKey, JSON.stringify({ flow, ownerId: owner.id, expiresAt: now + 30_000, request, step: 12 }));
  assert.equal(readPlanningContinuation(tab, owner, flow, now)?.source, "google");
  tab.removeItem(`date-atlas:accepted-pick:${sessionId}`);
  const current = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(current?.source === "google" && current.reference.accepted, false);
  tab.setItem(`date-atlas:accepted-pick:${sessionId}`, "google-venue");
  const accepted = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(accepted?.source === "google" && accepted.reference.accepted, true);
  tab.removeItem(`date-atlas:accepted-pick:${sessionId}`);
  retainPlanningContinuation(tab, owner, flow, now);
  const changed = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(changed?.source === "google" && changed.reference.accepted, false, "An explicitly cleared current acceptance marker is authoritative on hide");
});

test("owner binding rejects other accounts, while ownerless legacy records are limited to guests", () => {
  const tab = storage();
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference()));
  retainPlanningContinuation(tab, owner, flow, now);
  assert.equal(readPlanningContinuation(tab, { id: "other-owner", anonymous: false }, flow, now), null);
  assert.equal(readPlanningContinuation(tab, guest, flow, now), null);
  for (const ownerId of [undefined, null]) {
    tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ ownerId })));
    tab.removeItem(planningContinuationsKey);
    assert.equal(readPlanningContinuation(tab, owner, flow, now), null);
    assert.equal(readPlanningContinuation(tab, guest, flow, now)?.source, "google");
    assert.equal(readPlanningContinuation(tab, { id: null, anonymous: false }, flow, now)?.source, "google");
  }
});

test("expired, unbounded, invalid and legacy full Google payloads cannot resume", () => {
  const tab = storage();
  for (const invalid of [
    reference({ expiresAt: now }), reference({ expiresAt: now + draftLifetimeMs + 1 }),
    reference({ flow: "unsafe-flow" }), reference({ sessionId: "bad-id" }), reference({ placeId: "" }),
    reference({ placeId: "a".repeat(201) }),
    { flow, request, result: { nearby: { places: [{ id: "google-venue", details: { rating: 5 } }] } }, expiresAt: now + 10_000 },
  ]) {
    tab.setItem(activeDiscoveryKey, JSON.stringify(invalid));
    assert.equal(readPlanningContinuation(tab, owner, undefined, now), null);
  }
  for (const key of [activeDiscoveryKey, activePlanKey, draftKey, planningContinuationsKey]) tab.setItem(key, "invalid JSON");
  assert.equal(readPlanningContinuation(tab, owner, undefined, now), null);
  assert.equal(readPlanningContinuation({ getItem() { throw new Error("Storage blocked"); } }, owner, flow, now), null);
});

test("catalog acceptance and recipe details are retained without private free text", () => {
  const tab = storage();
  tab.setItem(activePlanKey, JSON.stringify({ flow, ownerId: owner.id, expiresAt: now + 10_000, recipe }));
  tab.setItem("date-atlas:accepted-catalog:v1", recipe.id);
  retainPlanningContinuation(tab, owner, flow, now);
  tab.removeItem(activePlanKey);
  tab.removeItem("date-atlas:accepted-catalog:v1");
  const resumed = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(resumed?.source, "catalog");
  if (resumed?.source !== "catalog") return assert.fail("Expected catalog continuation");
  assert.equal(resumed.accepted, true);
  assert.equal(resumed.recipe.id, recipe.id);
  assert.equal(resumed.recipe.title, "Your chosen date");
  assert.equal(resumed.recipe.request.date, request.date);
  assert.equal(resumed.recipe.request.startTime, request.startTime);
  assert.equal(resumed.recipe.request.quiet, true);
  assert.deepEqual(resumed.recipe.request.dietary, ["vegetarian"]);
  assert.doesNotMatch(tab.getItem(planningContinuationsKey) ?? "", /PRIVATE/);
});

test("only progressed drafts resume, and their archive strips transcripts and arbitrary fields without extending expiry", () => {
  const tab = storage();
  const draft = { flow, ownerId: owner.id, expiresAt: now + 10_000, request, version: plannerDraftVersion, step: 0, privateField: "PRIVATE FIELD" };
  tab.setItem(draftKey, JSON.stringify(draft));
  assert.equal(readPlanningContinuation(tab, owner, flow, now), null);
  tab.setItem(draftKey, JSON.stringify({ ...draft, editingPlan: true, chatSession: { messages: [{ id: "private-transcript", role: "user", text: "PRIVATE TRANSCRIPT" }], answered: [], nextField: "location" } }));
  retainPlanningContinuation(tab, owner, flow, now);
  tab.removeItem(draftKey);
  const resumed = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(resumed?.source, "draft");
  if (resumed?.source !== "draft") return assert.fail("Expected progressed draft");
  assert.equal(resumed.expiresAt, draft.expiresAt);
  assert.equal(resumed.draft.expiresAt, draft.expiresAt);
  assert.equal(resumed.draft.needsPreferenceReview, true);
  assert.equal(resumed.draft.editingPlan, true);
  assert.doesNotMatch(tab.getItem(planningContinuationsKey) ?? "", /PRIVATE/);
  assert.equal(readPlanningContinuation(tab, owner, flow, draft.expiresAt), null);
  tab.setItem(draftKey, JSON.stringify({ ...draft, chatSession: { messages: [], answered: ["location"], nextField: "occasion" } }));
  assert.equal(readPlanningContinuation(tab, owner, flow, now)?.source, "draft");
});

test("retention keeps at most five current owner flows, replaces the same flow and prunes expired records", () => {
  const tab = storage();
  const flows = Array.from({ length: 6 }, (_, index) => `12345678-1234-4234-8234-123456789ab${index}`);
  flows.forEach((nextFlow, index) => {
    tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ flow: nextFlow, expiresAt: now + 1_000 + index })));
    retainPlanningContinuation(tab, owner, nextFlow, now);
  });
  const raw: unknown = JSON.parse(tab.getItem(planningContinuationsKey) ?? "null");
  assert.ok(Array.isArray(raw));
  assert.equal(raw.length, 5);
  assert.equal(readPlanningContinuation(tab, owner, flows[0], now), null);
  assert.equal(readPlanningContinuation(tab, owner, undefined, now)?.flow, flows[5]);
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ flow: flows[5], placeId: "changed-venue", expiresAt: now + 1_005 })));
  retainPlanningContinuation(tab, owner, flows[5], now);
  const changed = readPlanningContinuation(tab, owner, flows[5], now);
  assert.equal(changed?.source === "google" && changed.reference.placeId, "changed-venue");
  retainPlanningContinuation(tab, owner, flows[5], now + 1_006);
  assert.equal(tab.getItem(planningContinuationsKey), "[]");
  clearPlanningContinuations(tab);
  assert.equal(tab.getItem(planningContinuationsKey), null);
});

test("direct flow produces a local plan URL and malformed archived owner or flow cannot override it", () => {
  const tab = storage();
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ flow: "direct" })));
  const current = readPlanningContinuation(tab, owner, undefined, now);
  assert.ok(current);
  assert.equal(continuationPath(current), "/plan");
  tab.setItem(planningContinuationsKey, JSON.stringify([{ ...current, ownerId: "other-owner", reference: { ...reference(), flow: otherFlow } }]));
  assert.equal(readPlanningContinuation(tab, owner, undefined, now)?.flow, "direct");
});

test("guest results become resumable by an account only after the authorized return reference is rebound", () => {
  const tab = storage();
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ ownerId: guest.id })));
  tab.setItem(`date-atlas:accepted-pick:${sessionId}`, "google-venue");
  retainPlanningContinuation(tab, guest, flow, now);
  assert.equal(readPlanningContinuation(tab, owner, flow, now), null);
  tab.setItem(activeDiscoveryKey, JSON.stringify(reference({ ownerId: owner.id, accepted: true })));
  retainPlanningContinuation(tab, owner, flow, now);
  const resumed = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(resumed?.source === "google" && resumed.reference.accepted, true);
  assert.equal(readPlanningContinuation(tab, guest, flow, now), null);

  tab.removeItem(activeDiscoveryKey);
  tab.setItem(activePlanKey, JSON.stringify({ flow, ownerId: guest.id, expiresAt: now + 20_000, recipe }));
  tab.setItem("date-atlas:accepted-catalog:v1", recipe.id);
  retainPlanningContinuation(tab, guest, flow, now);
  assert.equal(readPlanningContinuation(tab, owner, flow, now), null);
  tab.setItem(activePlanKey, JSON.stringify({ flow, ownerId: owner.id, expiresAt: now + 20_000, recipe }));
  retainPlanningContinuation(tab, owner, flow, now);
  const catalog = readPlanningContinuation(tab, owner, flow, now);
  assert.equal(catalog?.source === "catalog" && catalog.accepted, true);
  assert.equal(readPlanningContinuation(tab, guest, flow, now), null);
});
