import test from "node:test";
import assert from "node:assert/strict";
import { requestSchema, generateSchema } from "../lib/planner/schema";
import { applyIntakeOutput, chatSessionSchema, intakeInputSchema, intakeFields, intakeNextField } from "../lib/planner/intake";
import { plannerQuestions, restorePlannerStep } from "../lib/planner/questions";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { generateSinglePlan } from "../lib/planner/engine";
import { providerFactsSchema, venueRequestIssues } from "../lib/maps/venue-facts";
import { requestForPlace } from "../lib/planner/timing";
import { explicitClockTimes } from "../lib/planner/spoken-values";
import { localDateCalendar } from "../lib/planner/readiness";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Anniversary", budget: 40000, vibes: ["Creative"], date: "2030-11-09", startTime: "18:00", durationMode: "estimated", dietary: ["halal"], accessibility: true });
const input = (message: string, nextField: "time" | null = null) => intakeInputSchema.parse({ request, message, today: "2030-11-08", answered: nextField ? intakeFields.filter(field => field !== "time") : intakeFields, nextField });

test("a chosen start time completes chat without collecting a stay length or time zone", () => {
  const reply = applyIntakeOutput(input("Start at 7:45 PM.", "time"), { acknowledgement: "That time works.", patch: { startTime: "19:45", duration: 720 } });
  assert.ok(reply); assert.equal(reply.ready, true); assert.equal(reply.nextField, null);
  assert.equal(reply.request.startTime, "19:45"); assert.equal(reply.request.duration, request.duration);
  assert.equal(reply.request.budget, 40000); assert.deepEqual(reply.request.dietary, ["halal"]); assert.equal(reply.request.accessibility, true);
  assert.doesNotMatch(reply.message, /how long|hours|time zone/i);
  assert.equal(intakeNextField({ ...reply.request, timeZoneConfirmed: false }, intakeFields), null);
});
test("an evening preference never assigns a clock time and time edits preserve other answers", () => {
  const vague = applyIntakeOutput(input("An evening date.", "time"), { acknowledgement: "An evening together.", patch: { startTime: "18:00" } });
  assert.equal(vague?.ready, false); assert.equal(vague?.nextField, "time"); assert.equal(vague?.answered.includes("time"), false);
  const edit = applyIntakeOutput(input("Change my time"), { acknowledgement: "Got it.", patch: {} });
  assert.equal(edit?.nextField, "time"); assert.equal(edit?.request.budget, request.budget); assert.deepEqual(edit?.request.vibes, request.vibes);
});
test("old drafts and chat sessions skip the retired duration question without losing answers", () => {
  assert.equal(plannerQuestions.some(question => String(question.id) === "duration"), false);
  assert.equal(plannerQuestions[restorePlannerStep(12, 12)].id, "review");
  assert.equal(plannerQuestions[restorePlannerStep(0, 12, "duration")].id, "review");
  assert.equal(plannerQuestions[restorePlannerStep(11, 12)].id, "time");
  const old = chatSessionSchema.parse({ messages: [], answered: [...intakeFields, "duration"], nextField: "duration" });
  assert.deepEqual(old.answered, intakeFields); assert.equal(old.nextField, null);
  assert.equal(intakeNextField(request, old.answered), null);
});
test("automatic scheduling uses the activity length and preserves actual opening-hours checks", () => {
  const venue = { ...demoCatalog[0], price: 0, duration: 120, hours: Array.from({ length: 7 }, (_, day) => ({ day, open: 600, close: 1200 })) };
  const parsed = generateSchema.parse({ request: { ...request, duration: 60, endTime: "11:30", startTime: "11:00", includeFood: false, includeTransport: false, transport: "Walking", accessibility: false, dietary: [] } });
  const plan = generateSinglePlan(parsed, [venue], undefined, venue).plans[0];
  assert.ok(plan); assert.ok(plan.duration >= 120); assert.equal(plan.request.duration, plan.duration); assert.equal(plan.request.endTime, "");
  assert.equal(generateSinglePlan({ ...parsed, request: plan.request }, [venue], undefined, venue).plans[0]?.id, plan.id);
  assert.equal(generateSinglePlan({ ...parsed, request: { ...parsed.request, durationMode: "specified" } }, [venue], undefined, venue).plans.length, 0);
  assert.equal(generateSinglePlan({ ...parsed, request: { ...parsed.request, startTime: "19:45" } }, [venue], undefined, venue).plans.length, 0);
  const shortPlan = generateSinglePlan(parsed, [{ ...venue, duration: 30 }], undefined, venue).plans[0];
  assert.ok(shortPlan); assert.equal(shortPlan.duration, 30);
  assert.equal(requestSchema.safeParse(shortPlan.request).success, true, "A short activity must remain saveable and replayable");
});
test("live venues are checked using an internal visit estimate instead of an unchosen multi-hour window", () => {
  const facts = providerFactsSchema.parse({ regularOpeningHours: { periods: [{ open: { day: 6, hour: 18 }, close: { day: 6, hour: 20 } }] } });
  const preferences = { ...request, duration: 300, accessibility: false, dietary: [] };
  assert.equal(venueRequestIssues(facts, preferences, 0).includes("opening-hours"), false);
  assert.equal(venueRequestIssues(facts, { ...preferences, durationMode: "specified" }, 0).includes("opening-hours"), true);
});
test("the selected venue supplies internal local timing while calendar exports keep the user's clock choice", () => {
  const preferences = { ...request, city: "Tokyo", country: "Japan", startTime: "19:45", timeZoneConfirmed: false };
  const place = { id: "test-place", name: "Test venue", address: "Tokyo, Japan", category: "Art", distanceKm: 1, reason: "Test only", mapsUrl: "https://www.google.com/maps/", attributions: [], details: { checkedAt: "2030-11-01T00:00:00Z", opening: "fits" as const, hours: [], timeZone: "Asia/Tokyo", travelMinutes: 10, reviews: [] } };
  const resolved = requestForPlace(preferences, place);
  assert.equal(resolved.startTime, "19:45"); assert.equal(resolved.timeZone, "Asia/Tokyo"); assert.equal(resolved.duration, 110); assert.equal(resolved.timeZoneConfirmed, true);
  const calendar = localDateCalendar(place, preferences, "test");
  assert.match(calendar, /DTSTART:20301109T104500Z/); assert.match(calendar, /DTEND:20301109T123500Z/);
  assert.doesNotMatch(calendar, /halal|40000/);
});
test("only explicit numeric, spoken, noon and midnight times authorize a selected clock value", () => {
  for (const [message, expected] of [["At 7:45 PM", "19:45"], ["At 19:45", "19:45"], ["Start at seven forty-five pm", "19:45"], ["At noon", "12:00"], ["At midnight", "00:00"]]) assert.deepEqual(explicitClockTimes(message), [expected]);
  for (const message of ["An evening date", "Morning", "Not 7 PM", "7 PM or 8 PM", "25:00", "7:60 pm", "My budget is 40000 for 2 people"]) assert.deepEqual(explicitClockTimes(message), [], message);
});
