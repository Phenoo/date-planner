import test from "node:test";
import assert from "node:assert/strict";
import { confirmChatLocation } from "../lib/planner/chat-location";
import { emptyChatSession, intakeFields, type ChatSession } from "../lib/planner/intake";
import { requestSchema } from "../lib/planner/schema";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", currentCity: "Lagos", startingArea: "Lekki", occasion: "Anniversary", vibes: ["Creative"], budget: 60000, maxDistance: 10, dietary: ["halal"], accessibility: true, date: "2030-11-09", startTime: "14:00", duration: 240 });
const location = { city: "Abuja", area: "Wuse", country: "Nigeria" };

test("a confirmed detected city changes only destination and origin fields", () => {
  const result = confirmChatLocation(request, emptyChatSession(), location, "2026-11-04");
  assert.deepEqual(result.request, { ...request, city: "Abuja", country: "Nigeria", area: "Abuja", currentCity: "Abuja", startingArea: "Wuse", locationScope: "city" });
  assert.deepEqual(result.answered, ["location"]);
  assert.equal(result.nextField, "occasion");
  assert.match(result.message, /Let’s plan in Abuja/);
  assert.equal(request.city, "Lagos");
});

test("a detected city matching defaults still needs and records explicit confirmation", () => {
  const session = emptyChatSession();
  const result = confirmChatLocation(request, session, { city: "Lagos", area: "Lekki", country: "Nigeria" }, "2026-11-04");
  assert.deepEqual(result.answered, ["location"]);
  assert.deepEqual(session.answered, []);
  assert.equal(result.request.budget, 60000);
  assert.deepEqual(result.request.dietary, ["halal"]);
  assert.equal(result.request.accessibility, true);
});

test("confirming location preserves prior answers and asks the next missing question", () => {
  const session: ChatSession = { ...emptyChatSession(), answered: ["occasion", "budget", "location"] };
  const result = confirmChatLocation(request, session, location, "2026-11-04");
  assert.deepEqual(result.answered, session.answered);
  assert.equal(result.nextField, "people");
  assert.equal(result.answered.filter((field) => field === "location").length, 1);
  assert.match(result.message, /How many people/);
});

test("editing a completed date's location keeps its schedule, spending and requirements", () => {
  const session = { ...emptyChatSession(), answered: [...intakeFields], nextField: null };
  const result = confirmChatLocation(request, session, { city: "Accra", area: "Osu", country: "Ghana" }, "2026-11-04");
  assert.equal(result.request.country, "Ghana");
  assert.equal(result.request.date, request.date);
  assert.equal(result.request.startTime, request.startTime);
  assert.equal(result.request.budget, request.budget);
  assert.equal(result.request.maxDistance, request.maxDistance);
  assert.equal(result.request.accessibility, request.accessibility);
  assert.deepEqual(result.request.dietary, request.dietary);
  assert.deepEqual(result.answered, [...intakeFields]);
  assert.equal(result.nextField, null);
});
