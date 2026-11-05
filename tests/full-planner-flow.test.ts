import assert from "node:assert/strict";
import test from "node:test";
import { draftJSON, draftResumePath } from "../lib/planner/draft-retention";
import { activeDiscoveryKey } from "../lib/planner/discovery-session";
import { wizardQuestionSteps } from "../lib/planner/intake";
import { readPlanningContinuation, retainPlanningContinuation } from "../lib/planner/planning-continuation";
import { plannerDraftVersion, plannerQuestions, restorePlannerStep } from "../lib/planner/questions";
import { requestSchema } from "../lib/planner/schema";

test("fresh planning includes the complete questionnaire and separate date and time questions", () => {
  const request = requestSchema.parse({ city: "Lagos", area: "Lagos", occasion: "Romantic date", budget: null, vibes: ["Romantic"] });
  assert.deepEqual(wizardQuestionSteps(request, [], "2030-11-01").map(step => plannerQuestions[step].id), [
    "yourGender", "dateGender", "city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "review",
  ]);
});

test("drafts from the shorter flow retain their question destinations and chosen answers", () => {
  const request = requestSchema.parse({ city: "Lagos", area: "Lekki", currentCity: "Lagos", occasion: "Romantic date", budget: 40_000, vibes: ["Romantic"], date: "2030-11-02", startTime: "18:00" });
  for (const [step, id] of [[2, "city"], [6, "vibes"], [9, "budget"], [10, "date"], [12, "review"]] as const) {
    const draft = JSON.parse(draftJSON({ request, step, version: 13 }));
    assert.equal(plannerQuestions[restorePlannerStep(draft.step, draft.version, draft.questionId)].id, id);
    assert.equal(draft.request.budget, 40_000);
    assert.equal(draft.request.date, "2030-11-02");
    assert.equal(draft.request.startTime, "18:00");
  }
  assert.equal(plannerDraftVersion, 13);
});

test("untouched fresh and legacy location drafts cannot replace a chosen date's Continue action", () => {
  const now = 1_000;
  const firstFlow = "12345678-1234-4234-8234-123456789abc";
  const freshFlow = "12345678-1234-4234-8234-123456789abd";
  const sessionId = "12345678-1234-4234-8234-123456789abe";
  const owner = { id: "fixture-owner", anonymous: false };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  storage.setItem(activeDiscoveryKey, JSON.stringify({ flow: firstFlow, ownerId: owner.id, sessionId, placeId: "chosen-venue", accepted: true, expiresAt: now + 10_000 }));
  storage.setItem(`date-atlas:accepted-pick:${sessionId}`, "chosen-venue");
  retainPlanningContinuation(storage, owner, firstFlow, now);
  const request = requestSchema.parse({ city: "Lagos", area: "Lagos", currentCity: "", occasion: "Romantic date", budget: null, vibes: ["Romantic"] });
  const draftKey = `date-atlas:planning-draft:v${plannerDraftVersion}`;
  for (const step of [0, 2]) {
    const draft = { flow: freshFlow, ownerId: owner.id, version: plannerDraftVersion, step, expiresAt: now + 20_000, request };
    storage.setItem(draftKey, JSON.stringify(draft));
    retainPlanningContinuation(storage, owner, freshFlow, now);
    assert.equal(readPlanningContinuation(storage, owner, undefined, now)?.flow, firstFlow);
    assert.equal(draftResumePath(JSON.stringify(draft), now), null);
  }
  storage.setItem(draftKey, JSON.stringify({ flow: freshFlow, ownerId: owner.id, version: plannerDraftVersion, step: 2, expiresAt: now + 20_000, request: { ...request, currentCity: "Lagos" } }));
  assert.equal(readPlanningContinuation(storage, owner, undefined, now)?.flow, freshFlow);
  assert.equal(draftResumePath(storage.getItem(draftKey), now), `/plan?flow=${freshFlow}`);
});
