import assert from "node:assert/strict";
import test from "node:test";
import { draftJSON, draftRequest, draftIsCurrent } from "../lib/planner/draft-retention";
import { requestSchema } from "../lib/planner/schema";
import { readPlanningResponse, PlanningRequestError } from "../lib/firebase/planner-client";
const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60000, vibes: ["Romantic"], date: "2026-11-07", startTime: "18:00", duration: 180, notes: "PRIVATE NAME likes quiet vegetarian places", interests: "PRIVATE INTEREST", dislikes: "PRIVATE EXCLUSION", yourGender: "man" });
test("browser draft serialization preserves schedule and hard requirements without free text or transcripts", () => {
  const raw = draftJSON({ request, step: 13, chatSession: { messages: [{ role: "user", text: "PRIVATE MESSAGE" }], answered: ["date"], nextField: null } });
  assert.doesNotMatch(raw, /PRIVATE/);
  const draft = JSON.parse(raw);
  assert.equal(draft.needsPreferenceReview, true);
  assert.equal(draft.request.date, request.date);
  assert.equal(draft.request.startTime, request.startTime);
  assert.equal(draft.request.timeZone, "Africa/Lagos");
  assert.equal(draft.request.budget, 60000);
  assert.deepEqual(draft.request.dietary, ["vegetarian"]);
  assert.equal(draft.request.quiet, true);
  assert.deepEqual(draft.chatSession.messages, []);
  assert.equal(draftIsCurrent(draft), true);
  assert.equal(draftIsCurrent(draft, draft.expiresAt + 1), false);
  assert.equal(draftRequest(request).yourGender, "");
  assert.doesNotMatch(draftJSON({ request: { ...request, city: "" } }), /PRIVATE/, "Temporarily invalid form input must not bypass minimization");
});
test("HTTP and streamed generation conflicts retain status for a fresh retry", async () => {
  for (const response of [Response.json({ error: "Stale result" }, { status: 409 }), new Response(JSON.stringify({ type: "result", status: 409, data: { error: "Stale result" } }) + "\n", { headers: { "Content-Type": "application/x-ndjson" } })]) {
    await assert.rejects(readPlanningResponse(response, () => {}), (error: unknown) => error instanceof PlanningRequestError && error.status === 409);
  }
});
