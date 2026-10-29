import test from "node:test";
import assert from "node:assert/strict";
import { validateModification } from "../lib/planner/ai";
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
    "She's vegetarian; afternoon please",
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
