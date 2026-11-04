import test from "node:test";
import assert from "node:assert/strict";
import { applyIntakeOutput, intakeFields, intakeInputSchema } from "../lib/planner/intake";
import { explicitIntakeCorrection } from "../lib/planner/intake-corrections";
import { requestSchema } from "../lib/planner/schema";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Anniversary", budget: 60000, budgetType: "per-person", guests: 2, vibes: ["Creative"], date: "2030-11-02", startTime: "16:00", duration: 240, dietary: ["halal"], accessibility: true });
const input = (message: string) => intakeInputSchema.parse({ request, message, answered: intakeFields, nextField: null, today: "2030-11-01" });

test("an area correction changes only location even if AI supplies unrelated changes", () => {
  const value = input("Actually, Ikoyi. Keep everything else.");
  assert.ok(explicitIntakeCorrection(value));
  const reply = applyIntakeOutput(value, { acknowledgement: "Updated.", patch: { guests: 6, budget: 100000, vibes: ["Playful"] } });
  assert.ok(reply); assert.equal(reply.request.area, "Ikoyi");
  assert.deepEqual(reply.request, { ...request, area: "Ikoyi", locationScope: "area", currentCity: "Lagos" });
  assert.deepEqual(reply.answered, [...intakeFields]); assert.equal(reply.ready, true);
});

test("for both of us means a total and preserves all unrelated answers", () => {
  const value = input("₦40,000 for both of us");
  const direct = explicitIntakeCorrection(value); assert.ok(direct);
  const reply = applyIntakeOutput(value, direct); assert.ok(reply);
  assert.deepEqual(reply.request, { ...request, budget: 40000, budgetType: "total" });
  assert.deepEqual(reply.answered, [...intakeFields]); assert.equal(reply.ready, true);
});

test("keep everything else cannot erase a completed answer or relax requirements", () => {
  const reply = applyIntakeOutput(input("Keep everything else."), { acknowledgement: "All set.", patch: { guests: 4, dietary: [], accessibility: false, budget: null } });
  assert.ok(reply); assert.deepEqual(reply.request, request); assert.deepEqual(reply.answered, [...intakeFields]); assert.equal(reply.ready, true);
});

test("small foreign-currency budgets work while ambiguous dollars need confirmation", () => {
  const value = { ...input("$40.50 for both of us"), request: { ...request, country: "United States", city: "New York", currency: "USD" } };
  const direct = explicitIntakeCorrection(value); assert.ok(direct);
  const reply = applyIntakeOutput(value, direct); assert.equal(reply?.request.budget, 40.5); assert.equal(reply?.request.budgetType, "total");
  const ambiguous = applyIntakeOutput(input("$40 for both of us"), { acknowledgement: "Updated.", patch: { budget: 40, currency: "USD" } });
  assert.deepEqual(ambiguous?.request, request); assert.equal(ambiguous?.ready, false); assert.equal(ambiguous?.nextField, "budget");
});
