import test from "node:test";
import assert from "node:assert/strict";
import { requestSchema, generateSchema } from "../lib/planner/schema";
import { generatePlans } from "../lib/planner/engine";
import { plannerQuestions, restorePlannerStep } from "../lib/planner/questions";
import { dateStoryIntroduction, dateStorySchema, dateTimingLabel, fallbackDateStory } from "../lib/planner/date-story";
import { invitationInputSchema, nextInvitationResponse, publicInvitationSchema } from "../lib/planner/invitations";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: null, vibes: ["Creative"], datePreference: "weekday", duration: 180 });
test("weekday/weekend requests do not require a calendar date or a starting time", () => {
  assert.equal(request.date, "");
  assert.equal(request.startTime, "");
  assert.equal(request.datePreference, "weekday");
  assert.equal(requestSchema.safeParse({ ...request, datePreference: "someday" }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, startTime: "26:00" }).success, false);
  assert.deepEqual(plannerQuestions.find((question) => question.id === "date")?.fields, ["datePreference"]);
  assert.equal(restorePlannerStep(8, 8), plannerQuestions.findIndex((question) => question.id === "date"));
});
test("flexible timing never turns into an invented date, opening-hours check or scheduled itinerary", () => {
  const result = generatePlans(generateSchema.parse({ request }), []);
  assert.equal(result.plans.length, 0);
  assert.match(result.warnings[0], /agree on a day and time/);
  assert.match(dateTimingLabel("weekday", ""), /^Weekday.*decide together/);
  assert.equal(dateTimingLabel("weekend", "15:00"), "Weekend · 3:00 PM");
  assert.equal(dateTimingLabel("weekend", "", true), "Weekend date");
});
test("date stories remain suggestions and support creative, outdoor and dining experiences", () => {
  for (const category of ["Art gallery", "Park", "Restaurant", "Bowling alley"]) {
    const story = dateStorySchema.parse(fallbackDateStory(category));
    assert.equal(story.moments.length, 3);
    assert.doesNotMatch(JSON.stringify(story), /reserved|confirmed|₦|\d:\d/);
  }
  assert.notEqual(fallbackDateStory("Art gallery").title, fallbackDateStory("Restaurant").title);
  assert.doesNotMatch(fallbackDateStory("Go-karting venue").title, /creativity/);
  const introduction = dateStoryIntroduction(request);
  assert.match(introduction, /weekday/);
  assert.match(introduction, /creativity/);
  assert.doesNotMatch(introduction, /known for|spacious|guaranteed|reserved/);
});
test("invitation responses are explicit, idempotent and cannot be overwritten by a conflicting reply", () => {
  assert.equal(nextInvitationResponse("pending", "accepted"), "accepted");
  assert.equal(nextInvitationResponse("pending", "declined"), "declined");
  assert.equal(nextInvitationResponse("accepted", "accepted"), "accepted");
  assert.equal(nextInvitationResponse("declined", "declined"), "declined");
  assert.equal(nextInvitationResponse("accepted", "declined"), null);
  assert.equal(nextInvitationResponse("declined", "accepted"), null);
  assert.equal(invitationInputSchema.safeParse({ action: "reply", token: "a".repeat(32), response: "pending" }).success, false);
  assert.equal(invitationInputSchema.safeParse({ action: "read", token: "../private/record" }).success, false);
});
test("a public invitation contains the chosen story and timing without private planning inputs", () => {
  const data = publicInvitationSchema.parse({ ...request, yourGender: "woman", dateGender: "man", place: null, placeId: "test-only-place", story: fallbackDateStory("Art gallery"), response: "pending", dateStatus: "planned", createdAt: new Date().toISOString(), ownerId: "private-owner", token: "private-token", notes: "Private notes", dietary: ["vegan"] });
  for (const key of ["ownerId", "token", "notes", "budget", "dietary", "interests", "startingArea", "yourGender", "dateGender"]) assert.equal(key in data, false);
  assert.equal(data.startTime, "");
});
