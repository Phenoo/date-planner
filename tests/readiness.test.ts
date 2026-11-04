import test from "node:test";
import assert from "node:assert/strict";
import { localDateCalendar, venueDecision } from "../lib/planner/readiness";
import { requestSchema } from "../lib/planner/schema";
import type { DatePlace } from "../lib/planner/readiness";

const request = requestSchema.parse({ city: "London", country: "United Kingdom", currency: "GBP", area: "Bankside", occasion: "Anniversary", budget: 100, vibes: ["Creative"], date: "2030-11-02", startTime: "16:00", duration: 240, notes: "private surprise", dietary: ["halal"], timeZone: "Europe/London" });
const place: DatePlace = { id: "venue", name: "A gallery", category: "Art", address: "Bankside, London", distanceKm: 2, reason: "Creative", mapsUrl: "https://www.google.com/maps/", attributions: [] };

test("the decision card exposes unknown costs, hours and travel instead of implying verification", () => {
  const result = venueDecision(place, request);
  assert.equal(result.cost, "Venue price unconfirmed");
  assert.equal(result.opening, "Opening hours unconfirmed");
  assert.equal(result.travel, "Travel time unconfirmed");
  assert.ok(result.missing.some((text) => text.includes("spending limit is unchanged")));
});

test("provider ranges scale by party size and never imply a confirmed complete-date price", () => {
  const venue = { ...place, details: { checkedAt: "2030-11-01T12:00:00Z", opening: "fits" as const, hours: [], price: { currency: "GBP", min: 15.5, max: 25 }, travelMinutes: 12, reviews: [] } };
  const result = venueDecision(venue, request);
  assert.equal(result.costLabel, "Venue estimate for 2"); assert.match(result.cost, /31/); assert.match(result.cost, /50/);
  assert.equal(result.travel, "About 12 min each way"); assert.ok(result.missing.some((text) => text.includes("fare is not included")));
  const foreign = venueDecision(venue, { ...request, currency: "USD" });
  assert.ok(foreign.missing.some((text) => text.includes("not been converted or compared")));
});

test("guest calendar downloads contain the chosen logistics and exclude private answers", () => {
  const calendar = localDateCalendar(place, request, "our-date", new Date("2030-11-01T12:00:00Z"));
  assert.match(calendar, /DTSTART:20301102T160000Z/);
  assert.match(calendar, /DTEND:20301102T200000Z/);
  assert.match(calendar, /SUMMARY:A date at A gallery/);
  assert.ok(!calendar.includes("private surprise")); assert.ok(!calendar.includes("halal")); assert.ok(!calendar.includes("budget"));
});
