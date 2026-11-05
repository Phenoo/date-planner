import assert from "node:assert/strict";
import test from "node:test";
import { draftJSON, draftResumePath } from "../lib/planner/draft-retention";
import { activeDiscoveryKey } from "../lib/planner/discovery-session";
import { readPlanningContinuation, retainPlanningContinuation } from "../lib/planner/planning-continuation";
import { plannerDraftVersion, plannerQuestions, plannerStartStep, quickPlannerQuestionIds, restorePlannerStep } from "../lib/planner/questions";
import { requestSchema } from "../lib/planner/schema";

test("fresh planning starts with location and uses five stages without changing saved question indices", () => {
  assert.equal(plannerQuestions[plannerStartStep].id, "city");
  assert.deepEqual(quickPlannerQuestionIds.map(id => plannerQuestions.findIndex(question => question.id === id)), [2, 6, 9, 10, 12]);
  assert.equal(plannerQuestions.length, 13);
  assert.equal(plannerDraftVersion, 13);
  const draft = JSON.parse(draftJSON({ step: plannerStartStep, version: plannerDraftVersion }));
  assert.equal(draft.questionId, "city");
  assert.equal(restorePlannerStep(draft.step, draft.version, draft.questionId), plannerStartStep);
});

test("saved optional questions and legacy timing drafts keep their semantic edit destinations", () => {
  const optionalSteps = ["yourGender", "dateGender", "area", "occasion", "people", "interests", "requirements", "time"];
  for (const id of optionalSteps) {
    const step = plannerQuestions.findIndex(question => question.id === id);
    assert.ok(step >= 0);
    assert.equal(restorePlannerStep(step, 13), step);
    assert.equal(restorePlannerStep(0, 13, id), step);
  }
  assert.equal(plannerQuestions[restorePlannerStep(12, 12)].id, "review", "Removed duration still resumes at review");
  assert.equal(plannerQuestions[restorePlannerStep(11, 12)].id, "time", "An existing standalone time question remains editable");
  assert.equal(plannerQuestions[restorePlannerStep(0, 12)].id, "yourGender", "Legacy drafts are not silently moved to the new starting question");
});

test("an untouched quick flow cannot replace a chosen date's Continue action, while selected locations resume", () => {
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
  const draft = { flow: freshFlow, ownerId: owner.id, version: plannerDraftVersion, step: plannerStartStep, expiresAt: now + 20_000, request };
  const draftKey = `date-atlas:planning-draft:v${plannerDraftVersion}`;
  storage.setItem(draftKey, JSON.stringify(draft));
  retainPlanningContinuation(storage, owner, freshFlow, now);
  assert.equal(readPlanningContinuation(storage, owner, undefined, now)?.flow, firstFlow);
  assert.equal(draftResumePath(JSON.stringify(draft), now), null);
  storage.setItem(draftKey, JSON.stringify({ ...draft, request: { ...request, currentCity: "Lagos" } }));
  assert.equal(readPlanningContinuation(storage, owner, undefined, now)?.flow, freshFlow);
  assert.equal(draftResumePath(storage.getItem(draftKey), now), `/plan?flow=${freshFlow}`);
});
