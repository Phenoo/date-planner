import test from "node:test";
import assert from "node:assert/strict";
import { interpretModification, validateModification } from "../lib/planner/ai";
import { requestSchema } from "../lib/planner/schema";
const request = requestSchema.parse({
  city: "Lagos",
  area: "Lekki",
  occasion: "Romantic date",
  budget: 60000,
  vibes: ["Romantic"],
  dietary: ["halal"],
  date: "2026-10-31",
  startTime: "18:00",
  endTime: "23:00",
  duration: 300,
});
const unchanged = {
  budget: null,
  duration: null,
  startTime: null,
  occasion: null,
  vibes: null,
  dietary: null,
  quiet: null,
  avoidRestaurants: null,
  includeFood: null,
  mode: "balanced",
  understood: true,
};
test("chat edits apply a model-parsed budget and preserve dietary restrictions", async (t) => {
  const env = process.env;
  process.env = { ...env, OPENAI_API_KEY: "test-only-key", OPENAI_MODEL: "", OPENAI_BASE_URL: "https://api.openai.com/v1" };
  t.after(() => { process.env = env; });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    id: "resp_test",
    output: [{
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify({ ...unchanged, budget: 45000 }), annotations: [] }],
    }],
  }));
  const result = await interpretModification("Could we spend at most 45000 for both of us?", request);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.request.budget, 45000);
  assert.deepEqual(result.request.dietary, ["halal"]);
});
test("AI cannot increase spending without an explicit amount", () => {
  assert.equal(
    validateModification("Make it more romantic", request, {
      ...unchanged,
      budget: 80000,
    }),
    null,
  );
  assert.equal(
    validateModification("Change my budget to 80k", request, {
      ...unchanged,
      budget: 80000,
    })?.request.budget,
    80000,
  );
  assert.equal(
    validateModification("Make it cheaper", request, {
      ...unchanged,
      budget: 40000,
    })?.request.budget,
    40000,
  );
});
test("AI preserves an unset budget unless the user names a new spending amount", () => {
  const openRequest = { ...request, budget: null };
  assert.equal(validateModification("Make it quieter", openRequest, { ...unchanged, quiet: true })?.request.budget, null);
  assert.equal(validateModification("Make it cheaper", openRequest, { ...unchanged, budget: 40000 }), null);
  assert.equal(validateModification("Set my budget to 40k", openRequest, { ...unchanged, budget: 40000 })?.request.budget, 40000);
});
test("AI dietary additions preserve requirements and time changes clear the prior deadline", () => {
  const result = validateModification(
    "She's vegetarian; start at 2 PM",
    request,
    { ...unchanged, dietary: ["vegetarian"], startTime: "14:00" },
  );
  assert.deepEqual(result?.request.dietary, ["halal", "vegetarian"]);
  assert.equal(result?.request.startTime, "14:00");
  assert.equal(result?.request.endTime, "");
  assert.equal(result?.request.budget, 60000);
});
test("malformed AI output and invalid constraints cannot reach the engine", () => {
  assert.equal(
    validateModification("Change the time", request, {
      ...unchanged,
      startTime: "25:00",
    }),
    null,
  );
  assert.equal(validateModification("Hello", request, { budget: 1000 }), null);
  assert.equal(
    validateModification("Hello", request, { ...unchanged, duration: 0 }),
    null,
  );
});
