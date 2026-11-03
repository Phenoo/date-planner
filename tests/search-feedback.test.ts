import test from "node:test";
import assert from "node:assert/strict";
import { mapNearbyPlaces, placesResponseSchema } from "../lib/maps/nearby";
import { nearbyResultSchema, nearbySearchSchema } from "../lib/maps/schema";
import { venueRequestIssues, fitsVenueRequest, providerFactsSchema } from "../lib/maps/venue-facts";
import { requirementsGuidance, searchFeedback } from "../lib/planner/search-feedback";
import { plannerValidationIssues } from "../lib/planner/validation";
import { requestSchema } from "../lib/planner/schema";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Casual date", budget: 60000, vibes: ["Playful"], date: "2026-11-07", startTime: "16:00", duration: 180 });
const origin = { lat: 6.45, lng: 3.46 };
const place = { id: "fixture", displayName: { text: "Fixture" }, businessStatus: "OPERATIONAL", types: ["restaurant"], location: { latitude: origin.lat, longitude: origin.lng } };
const now = new Date("2026-11-03T10:00:00Z");
const search = (records: unknown[], preferences = request) => mapNearbyPlaces(placesResponseSchema.parse({ places: records }), origin, nearbySearchSchema.parse(preferences));

test("empty results explain actual unconfirmed requirements without inventing a budget conflict", () => {
  const selected = { ...request, accessibility: true, dietary: ["vegetarian"] as typeof request.dietary };
  const result = search([place], selected);
  assert.equal(result.places.length, 0);
  assert.deepEqual(result.searchIssues, ["accessible-entrance", "vegetarian"]);
  assert.equal(searchFeedback("accessible-entrance", selected).question, "requirements");
  assert.equal(searchFeedback("vegetarian", selected).question, "requirements");
});

test("verified requirements are not blamed when opening hours exclude the place", () => {
  const result = search([{ ...place, accessibilityOptions: { wheelchairAccessibleEntrance: true }, servesVegetarianFood: true, regularOpeningHours: { periods: [] } }], { ...request, accessibility: true, dietary: ["vegetarian"] });
  assert.deepEqual(result.searchIssues, ["opening-hours"]);
  assert.equal(searchFeedback("opening-hours", request).question, "time");
});

test("no available source records never manufacture a dietary or access rejection", () => {
  for (const records of [[], [{ ...place, businessStatus: "CLOSED_PERMANENTLY" }]]) {
    assert.deepEqual(search(records, { ...request, dietary: ["halal"], accessibility: true }).searchIssues, ["no-places"]);
  }
});

test("out of reach records do not falsely blame requirements and successful searches omit blockers", () => {
  const far = { ...place, location: { latitude: 8, longitude: 3 } };
  assert.deepEqual(search([far], { ...request, dietary: ["vegan"] }).searchIssues, ["distance"]);
  const result = search([far, place]);
  assert.equal(result.places.length, 1);
  assert.equal(result.searchIssues, undefined);
});

test("unsupported dietary options stay required and are named exactly in advance and after a search", () => {
  for (const diet of ["vegan", "halal", "gluten-free"] as const) {
    const selected = { ...request, dietary: [diet] };
    const result = search([place], selected);
    assert.deepEqual(result.searchIssues, ["unverified-dietary"]);
    assert.ok(searchFeedback("unverified-dietary", selected).title.toLowerCase().includes(diet));
    assert.ok(requirementsGuidance(selected).includes(`cannot verify ${diet}`));
    assert.deepEqual(selected.dietary, [diet]);
  }
  assert.match(requirementsGuidance({ dietary: ["vegetarian", "halal"], accessibility: true }), /vegetarian, halal and step-free access/);
});

test("travel and price feedback comes from the same hard checks as venue eligibility", () => {
  const facts = providerFactsSchema.parse({ priceRange: { startPrice: { currencyCode: "NGN", units: "40000" } } });
  assert.deepEqual(venueRequestIssues(facts, request, 0), ["budget"]);
  assert.equal(fitsVenueRequest(facts, request, 0), false);
  assert.deepEqual(venueRequestIssues(facts, { ...request, budgetType: "per-person" }, 0), []);
  assert.deepEqual(venueRequestIssues(providerFactsSchema.parse({}), { ...request, duration: 60, transport: "Walking" }, 10), ["travel-time"]);
  assert.equal(searchFeedback("budget", request).question, "budget");
  assert.equal(searchFeedback("travel-time", request).question, "duration");
});

test("optional structured search feedback preserves old payloads and validates new payloads", () => {
  const result = search([]);
  assert.deepEqual(nearbyResultSchema.parse(result).searchIssues, ["no-places"]);
  const { searchIssues: _issues, ...legacy } = result;
  assert.ok(_issues);
  assert.equal(nearbyResultSchema.safeParse(legacy).success, true);
  assert.equal(nearbyResultSchema.safeParse({ ...result, searchIssues: ["invented-cause"] }).success, false);
});

test("review lists every missing answer and its edit destination without changing the draft", () => {
  const missing = { ...request, city: "", occasion: "", vibes: [], date: "", startTime: "" };
  const before = JSON.stringify(missing);
  const issues = plannerValidationIssues(missing, now);
  assert.deepEqual(issues.map((issue) => issue.question), ["city", "occasion", "vibes", "date", "time"]);
  assert.equal(JSON.stringify(missing), before);
  assert.deepEqual(plannerValidationIssues(request, now), []);
});

test("expired times and conflicting durations lead to their own fields rather than a generic Back message", () => {
  assert.deepEqual(plannerValidationIssues({ ...request, date: "2026-11-03", startTime: "10:00" }, now).map((issue) => issue.question), ["time"]);
  assert.deepEqual(plannerValidationIssues({ ...request, date: "2026-11-02" }, now).map((issue) => issue.question), ["date"]);
  assert.deepEqual(plannerValidationIssues({ ...request, endTime: "17:00" }, now).map((issue) => issue.question), ["duration"]);
  assert.doesNotThrow(() => plannerValidationIssues({ ...request, timeZone: "Invalid/Zone" }, now));
});
