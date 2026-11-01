import test from "node:test";
import assert from "node:assert/strict";
import { applyIntakeOutput, intakeInputSchema, intakeOutputSchema, intakeFields, intakeNextField, intakeTimeReply, answeredThroughStep, stepForIntake, chatSessionSchema } from "../lib/planner/intake";
import { requestSchema } from "../lib/planner/schema";
import { plannerQuestions } from "../lib/planner/questions";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", vibes: ["Romantic"], budget: 60000, date: "", startTime: "", duration: 300, dietary: ["halal"] });
const input = (message: string, overrides = {}) => intakeInputSchema.parse({ request, message, today: "2026-10-30", answered: [], nextField: "location", ...overrides });
test("exact time selections and typed times retain every minute without AI presets", () => {
  const preferences = { ...request, date: "2030-11-02", startTime: "18:00", endTime: "20:00" };
  for (const [message, expected] of [["Start at 19:45.", "19:45"], ["7:45 pm", "19:45"], ["7.45pm", "19:45"], ["09:17", "09:17"], ["12am", "00:00"], ["12 PM", "12:00"], ["At 8 PM", "20:00"], ["23:59", "23:59"]]) {
    const result = intakeTimeReply(input(message, { request: preferences, nextField: "time", answered: intakeFields }), new Date("2030-11-01T12:00:00Z"));
    assert.ok(result);
    assert.equal(result.request.startTime, expected);
    assert.equal(result.request.endTime, "");
    assert.deepEqual(result.request, { ...preferences, startTime: expected, endTime: "" });
    assert.equal(result.ready, true);
  }
});
test("time edits still reject past times in the venue timezone without changing other answers", () => {
  const preferences = { ...request, date: "2030-11-01", startTime: "18:00" };
  const now = new Date("2030-11-01T12:30:00Z");
  const past = intakeTimeReply(input("13:15", { request: preferences, nextField: "time", answered: intakeFields }), now);
  assert.equal(past?.ready, false);
  assert.equal(past?.nextField, "time");
  assert.match(past?.message ?? "", /already passed/);
  assert.deepEqual(past?.request, preferences);
  assert.equal(intakeTimeReply(input("13:30", { request: preferences, nextField: "time" }), now)?.ready, false);
  const future = intakeTimeReply(input("13:31", { request: preferences, nextField: "time", answered: intakeFields }), now);
  assert.equal(future?.request.startTime, "13:31");
  const expiredDate = intakeTimeReply(input("Start at 19:45.", { request: { ...preferences, date: "2030-10-31" }, nextField: "time" }), now);
  assert.equal(expiredDate?.nextField, "date");
  assert.equal(expiredDate?.ready, false);
});
test("ambiguous or invalid clock replies stay in the existing conversational validation path", () => {
  for (const message of ["25:00", "7:60 pm", "0pm", "13pm", "8", "not 8 PM", "7 PM or 8 PM", "two hours", "tomorrow at 7 PM"]) assert.equal(intakeTimeReply(input(message, { nextField: "time" })), null);
  assert.equal(intakeTimeReply(input("7:45", { nextField: "duration" })), null);
  assert.equal(intakeTimeReply(input("Start at 19:45", { request: { ...request, date: "2030-11-02" }, nextField: "duration" }))?.request.startTime, "19:45");
});
test("explicit occasion replies advance even when the AI omits an unchanged or informal answer", () => {
  for (const [message, occasion] of [["A first date", "First date"], ["Our anniversary", "Anniversary"], ["Just because", "Just because"]]) {
    const result = applyIntakeOutput(input(message, { answered: ["location"], nextField: "occasion" }), { acknowledgement: "A little time together sounds lovely.", patch: {} });
    assert.equal(result?.request.occasion, occasion);
    assert.equal(result?.nextField, "people");
    assert.equal(result?.request.budget, request.budget);
  }
  assert.equal(applyIntakeOutput(input("Something nice", { nextField: "occasion" }), { acknowledgement: "A little thought.", patch: {} })?.answered.includes("occasion"), false);
});
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
