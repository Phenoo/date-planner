import test from "node:test";
import assert from "node:assert/strict";
import { applyIntakeOutput, intakeInputSchema, intakeOutputSchema, intakeFields, intakeNextField, answeredThroughStep, stepForIntake, chatSessionSchema } from "../lib/planner/intake";
import { requestSchema } from "../lib/planner/schema";
import { plannerQuestions } from "../lib/planner/questions";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", vibes: ["Romantic"], budget: 60000, date: "", startTime: "", duration: 300, dietary: ["halal"] });
const input = (message: string, overrides = {}) => intakeInputSchema.parse({ request, message, today: "2026-10-30", answered: [], nextField: "location", ...overrides });
test("one chat message can supply every required preference, with the same validated planning request", () => {
  const result = applyIntakeOutput(input("Plan a creative anniversary in Lekki, Lagos, for two. ₦60,000 total including transport, on Saturday 7 November at 14:00 for 4 hours."), { acknowledgement: "A thoughtful little celebration is taking shape.", patch: { city: "Lagos", area: "Lekki", occasion: "Anniversary", guests: 2, vibes: ["Creative"], budget: 60000, date: "2026-11-07", startTime: "14:00", duration: 240 } });
  assert.ok(result);
  assert.equal(result.ready, true);
  assert.deepEqual(result.answered, [...intakeFields]);
  assert.equal(result.request.budget, 60000);
  assert.equal(result.request.duration, 240);
  assert.equal(result.request.datePreference, "weekend");
  assert.equal(result.request.locationScope, "area");
});
test("omitted fields and Zod defaults cannot overwrite existing answers or pretend to be confirmed", () => {
  const providerOutput = intakeOutputSchema.parse({ acknowledgement: "A new backdrop sounds lovely.", patch: { city: "Abuja" } });
  assert.deepEqual(Object.keys(providerOutput.patch), ["city"]);
  const result = applyIntakeOutput(input("Let's go to Abuja"), providerOutput);
  assert.ok(result);
  assert.equal(result.request.area, "Abuja");
  assert.equal(result.request.budget, 60000);
  assert.equal(result.request.duration, 300);
  assert.deepEqual(result.request.dietary, ["halal"]);
  assert.deepEqual(result.answered, ["location"]);
  assert.equal(result.ready, false);
  assert.equal(result.nextField, "occasion");
});
test("the assistant cannot invent a spending amount, open a fixed budget silently, or select a vague weekend", () => {
  assert.equal(applyIntakeOutput(input("Make it special"), { acknowledgement: "A little extra thought.", patch: { budget: 100000 } })?.request.budget, 60000);
  assert.equal(applyIntakeOutput(input("Make it special"), { acknowledgement: "A little extra thought.", patch: { budget: null } })?.request.budget, 60000);
  assert.equal(applyIntakeOutput(input("Somewhere in the open air"), { acknowledgement: "A little fresh air.", patch: { budget: null } })?.request.budget, 60000);
  assert.equal(applyIntakeOutput(input("Keep the budget open"), { acknowledgement: "Comfort still comes first.", patch: { budget: null } })?.request.budget, null);
  assert.equal(applyIntakeOutput(input("Set a budget of 40k"), { acknowledgement: "A comfortable ceiling.", patch: { budget: 40000 } })?.request.budget, 40000);
  const vague = applyIntakeOutput(input("This weekend"), { acknowledgement: "A little weekend adventure.", patch: { date: "2026-10-31" } });
  assert.equal(vague?.request.date, "");
  assert.equal(vague?.nextField, "date");
});
test("an exact date and time remain necessary, even if other groups were previously answered", () => {
  assert.equal(intakeNextField(request, intakeFields, "2026-10-30"), "date");
  assert.equal(intakeNextField({ ...request, date: "2026-11-07" }, intakeFields, "2026-10-30"), "time");
  const invented = applyIntakeOutput(input("Sounds lovely"), { acknowledgement: "A lovely idea.", patch: { startTime: "18:00" } });
  assert.equal(invented?.request.startTime, "");
  assert.equal(invented?.nextField, "time");
  assert.equal(applyIntakeOutput(input("Yesterday, Friday"), { acknowledgement: "A day together.", patch: { date: "2026-10-29" } })?.request.date, "");
});
test("chat changes retain dietary restrictions, clear an obsolete deadline and reject invalid values", () => {
  const result = applyIntakeOutput(input("Vegetarian too, and start at 14:00", { request: { ...request, startTime: "18:00", endTime: "22:00" } }), { acknowledgement: "Your comfort belongs in the plan.", patch: { dietary: ["vegetarian"], startTime: "14:00" } });
  assert.deepEqual(result?.request.dietary, ["halal", "vegetarian"]);
  assert.equal(result?.request.endTime, "");
  assert.equal(applyIntakeOutput(input("Plan it"), { acknowledgement: "A lovely idea.", patch: { guests: 99 } }), null);
  assert.equal(applyIntakeOutput(input("Plan it"), { acknowledgement: "A lovely idea.", patch: { startTime: "25:00" } }), null);
});
test("switching interfaces resumes at the missing detail, and bounded chat history can be restored", () => {
  const dateStep = plannerQuestions.findIndex(({ id }) => id === "date");
  assert.deepEqual(answeredThroughStep(dateStep), ["location", "occasion", "people", "vibe", "budget"]);
  assert.equal(plannerQuestions[stepForIntake("vibe")].id, "vibes");
  assert.equal(plannerQuestions[stepForIntake(null)].id, "review");
  assert.ok(chatSessionSchema.safeParse({ messages: [{ id: "one", role: "user", text: "Plan something creative" }], answered: ["vibe"], nextField: "location" }).success);
  assert.equal(chatSessionSchema.safeParse({ messages: [], answered: ["invented"], nextField: null }).success, false);
});
