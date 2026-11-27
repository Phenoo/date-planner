import assert from "node:assert/strict";
import test from "node:test";
import { fallbackDateStory } from "../lib/planner/date-story";
import { chosenDateSchema } from "../lib/planner/invitations";
import { savedRecipeSchema } from "../lib/planner/saved";
import { upcomingHomeDate } from "../lib/planner/upcoming-date";

const now = new Date("2026-11-27T17:30:00Z");
const chosen = chosenDateSchema.parse({
  id: "a".repeat(64), token: "a".repeat(32), dateStatus: "planned", date: "2026-11-27",
  startTime: "19:00", timeZone: "Africa/Lagos", datePreference: "weekday", city: "Lagos",
  country: "Nigeria", placeId: "cafe", place: null, story: fallbackDateStory("Cafe"),
  response: "pending", createdAt: "2026-11-01T12:00:00Z",
});
const recipe = savedRecipeSchema.parse({
  id: "dinner", title: "Dinner for two", type: "Best overall match", experienceIds: ["venue"],
  total: 60, image: "/images/restaurant.jpg", demo: false, savedAt: "2026-10-01T12:00:00Z",
  request: { city: "New York", area: "Soho", occasion: "Casual date", budget: 80,
    vibes: ["Romantic"], date: "2026-11-27", startTime: "12:45", timeZone: "America/New_York" },
});

test("Home compares scheduled dates across sources in each destination’s time zone", () => {
  assert.equal(upcomingHomeDate([chosen], [recipe], now)?.value, recipe);
  assert.equal(upcomingHomeDate([chosen], [recipe], new Date("2026-11-27T17:50Z"))?.value, chosen);
});

test("completed, undated and elapsed dates leave room for an idea or a draft", () => {
  assert.equal(upcomingHomeDate([
    { ...chosen, dateStatus: "completed" }, { ...chosen, date: "" }, { ...chosen, startTime: "18:00" },
  ], [], now), undefined);
  const undecidedTime = { ...chosen, startTime: "" };
  assert.equal(upcomingHomeDate([undecidedTime], [], now)?.value, undecidedTime);
});
