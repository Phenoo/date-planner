import test from "node:test";
import assert from "node:assert/strict";
import { explicitSpendingAmounts, explicitSpokenTimes, spokenClockReply } from "../lib/planner/spoken-values";
import { applyIntakeOutput, intakeFields, intakeInputSchema, intakeTimeReply } from "../lib/planner/intake";
import { requestSchema } from "../lib/planner/schema";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", vibes: ["Romantic"], budget: 60000, date: "2030-11-02", startTime: "18:00", duration: 180, dietary: ["halal"], accessibility: true });
const input = (message: string) => intakeInputSchema.parse({ request, message, today: "2030-11-01", answered: intakeFields, nextField: null, history: [] });

test("spoken spending amounts preserve clear scales, existing typed numbers and Nigerian shorthand", () => {
  for (const [message, expected] of [
    ["My budget is sixty thousand naira", 60000], ["twenty-five thousand", 25000],
    ["a hundred thousand", 100000], ["one hundred and fifty thousand", 150000],
    ["one million two hundred and thirty-four thousand five hundred and sixty-seven", 1234567],
    ["sixty k", 60000], ["twenty grand", 20000], ["₦60,000 total", 60000], ["60k", 60000],
    ["60 thousand", 60000], ["1.5 million", 1500000], ["2 hundred thousand", 200000],
  ] as const) assert.ok(explicitSpendingAmounts(message, true).includes(expected), message);
});

test("unrelated counts, negated amounts and malformed number phrases never authorize a new spending value", () => {
  assert.deepEqual(explicitSpendingAmounts("a thousand stories"), []);
  for (const message of ["one two thousand", "sixty and fifty thousand", "two thousand million", "minus sixty thousand", "not sixty thousand"]) assert.deepEqual(explicitSpendingAmounts(message, true), [], message);
  const proposed = applyIntakeOutput(input("A romantic date, budget sixty thousand naira"), { acknowledgement: "Got it.", patch: { budget: 100000 } });
  assert.equal(proposed?.request.budget, 60000);
  assert.equal(proposed?.nextField, "budget");
});

test("clear spoken budgets and clock times can arrive together without changing essential needs", () => {
  const result = applyIntakeOutput(input("My budget is forty thousand naira, starting at seven forty-five pm."), { acknowledgement: "Got it.", patch: { budget: 40000, startTime: "19:45" } });
  assert.equal(result?.ready, true);
  assert.deepEqual(result?.request, { ...request, budget: 40000, startTime: "19:45" });
  const wrongTime = applyIntakeOutput(input("Start at seven forty-five pm."), { acknowledgement: "Got it.", patch: { startTime: "20:00" } });
  assert.equal(wrongTime?.request.startTime, "18:00");
  assert.equal(wrongTime?.nextField, "time");
});

test("spoken clock replies retain exact minutes, AM/PM and the existing no-AI route", () => {
  for (const [message, expected] of [["Start at seven forty-five PM.", "19:45"], ["at eight pm", "20:00"], ["twelve am", "00:00"], ["twelve PM", "12:00"], ["nine oh five am", "09:05"], ["seven zero five pm", "19:05"], ["7p.m.", "19:00"], ["7:45 p.m.", "19:45"]] as const) {
    const reply = intakeTimeReply(input(message), new Date("2030-11-01T12:00:00Z"));
    assert.equal(reply?.request.startTime, expected, message);
    assert.deepEqual(reply?.request.dietary, request.dietary);
    assert.equal(reply?.request.accessibility, true);
    assert.equal(reply?.request.budget, request.budget);
  }
});

test("ambiguous, relative, negated and invalid spoken times still ask for a clearer answer", () => {
  for (const text of ["seven", "seven pm or eight pm", "not seven pm", "after seven pm", "quarter past seven pm", "half past seven pm", "one two pm", "seven sixty pm", "thirty seven pm", "tomorrow at seven pm"]) assert.equal(spokenClockReply(text), null, text);
  for (const text of ["seven pm or eight pm", "not seven pm", "after seven pm", "quarter past seven pm", "thirty seven pm"]) assert.deepEqual(explicitSpokenTimes(text), [], text);
});

test("a spoken time that has already passed cannot change the selected date or bypass schedule checks", () => {
  const data = input("Start at seven thirty am.");
  const result = intakeTimeReply({ ...data, request: { ...request, date: "2030-11-01" } }, new Date("2030-11-01T12:00:00Z"));
  assert.equal(result?.ready, false);
  assert.equal(result?.nextField, "time");
  assert.equal(result?.request.startTime, request.startTime);
  assert.equal(result?.request.date, "2030-11-01");
});
