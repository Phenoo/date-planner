import test from "node:test";
import assert from "node:assert/strict";
import { providerFactsSchema, venueOpeningStatus, fitsVenueRequest, providerPrice } from "../lib/maps/venue-facts";
import { addCalendarDays, calendarDay, scheduleError } from "../lib/planner/schedule";
import { generateSinglePlan } from "../lib/planner/engine";
import { generateSchema, requestSchema } from "../lib/planner/schema";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { restoreDiscoverySession } from "../lib/planner/discovery-session";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Casual date", budget: 60000, vibes: ["Playful"], date: "2026-10-31", startTime: "16:00", duration: 180 });
const hours = providerFactsSchema.parse({ regularOpeningHours: { periods: [{ open: { day: 6, hour: 10 }, close: { day: 6, hour: 20 } }] } });
test("calendar dates survive month/year boundaries and schedule validation never chooses a day or time", () => {
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(calendarDay("2026-10-31"), 6);
  assert.match(scheduleError({ ...request, date: "" }, "2026-10-29"), /actual day/);
  assert.match(scheduleError({ ...request, startTime: "" }, "2026-10-29"), /time/);
  assert.match(scheduleError({ ...request, date: "2026-10-28" }, "2026-10-29"), /future/);
  assert.match(scheduleError({ ...request, endTime: "17:00" }, "2026-10-29"), /duration/);
  assert.equal(scheduleError(request, "2026-10-29"), "");
});
test("opening checks respect the chosen weekday, full visit, overnight hours and adjacent intervals", () => {
  assert.equal(venueOpeningStatus(hours, "2026-10-31", 16 * 60, 180), "fits");
  assert.equal(venueOpeningStatus(hours, "2026-10-31", 19 * 60, 120), "closed");
  assert.equal(venueOpeningStatus(hours, "2026-11-01", 16 * 60, 60), "closed");
  const overnight = providerFactsSchema.parse({ regularOpeningHours: { periods: [{ open: { day: 6, hour: 20 }, close: { day: 0, hour: 2 } }] } });
  assert.equal(venueOpeningStatus(overnight, "2026-10-31", 23 * 60, 120), "fits");
  assert.equal(venueOpeningStatus(overnight, "2026-11-01", 60, 120), "closed");
  const adjacent = providerFactsSchema.parse({ regularOpeningHours: { periods: [{ open: { day: 6, hour: 10 }, close: { day: 6, hour: 14 } }, { open: { day: 6, hour: 14 }, close: { day: 6, hour: 20 } }] } });
  assert.equal(venueOpeningStatus(adjacent, request.date, 13 * 60, 120), "fits");
});
test("unknown hours stay unknown, explicit closures are excluded and current exceptions override regular hours", () => {
  assert.equal(venueOpeningStatus(providerFactsSchema.parse({}), request.date, 12 * 60, 60), "unknown");
  assert.equal(venueOpeningStatus(providerFactsSchema.parse({ regularOpeningHours: { periods: [] } }), request.date, 12 * 60, 60), "closed");
  const exceptional = providerFactsSchema.parse({ ...hours, timeZone: { id: "Africa/Lagos" }, currentOpeningHours: { periods: [] } });
  assert.equal(venueOpeningStatus(exceptional, request.date, 12 * 60, 60, new Date("2026-10-29T12:00:00Z")), "closed");
  const always = providerFactsSchema.parse({ regularOpeningHours: { periods: [{ open: { day: 0 } }] } });
  assert.equal(venueOpeningStatus(always, request.date, 23 * 60, 240), "fits");
});
test("known budget, access, dietary, schedule and travel conflicts cannot reach the reveal", () => {
  assert.equal(fitsVenueRequest(hours, request, 1), true);
  assert.equal(fitsVenueRequest(hours, { ...request, startTime: "21:00" }, 1), false);
  assert.equal(fitsVenueRequest(hours, { ...request, duration: 60, transport: "Walking" }, 20), false);
  assert.equal(fitsVenueRequest(providerFactsSchema.parse({ ...hours, accessibilityOptions: { wheelchairAccessibleEntrance: false } }), { ...request, accessibility: true }, 1), false);
  assert.equal(fitsVenueRequest(providerFactsSchema.parse({ ...hours, servesVegetarianFood: false }), { ...request, dietary: ["vegetarian"] }, 1), false);
  const expensive = providerFactsSchema.parse({ ...hours, priceRange: { startPrice: { currencyCode: "NGN", units: "40000" } } });
  assert.equal(fitsVenueRequest(expensive, request, 1), false);
  assert.equal(fitsVenueRequest(expensive, { ...request, budgetType: "per-person" }, 1), true);
  assert.deepEqual(providerPrice(expensive), { currency: "NGN", min: 40000 });
  assert.equal(providerPrice(providerFactsSchema.parse({})), undefined);
});
test("the single-experience catalog engine returns one valid pick, respects its ceiling and replaces rejected IDs", () => {
  const first = generateSinglePlan(generateSchema.parse({ request }), demoCatalog);
  assert.equal(first.plans.length, 1);
  assert.equal(first.plans[0].activities.length, 1);
  assert.ok(first.plans[0].total <= 60000);
  const excluded = first.plans[0].activities[0].experience.id;
  const next = generateSinglePlan(generateSchema.parse({ request, excludeIds: [excluded] }), demoCatalog);
  assert.equal(next.plans.length, 1);
  assert.notEqual(next.plans[0].activities[0].experience.id, excluded);
  assert.equal(generateSinglePlan(generateSchema.parse({ request: { ...request, budget: 1000 } }), demoCatalog).plans.length, 0);
});
test("accepted discovery recovery validates the flow, expiration and venue records", () => {
  const result = { nearby: { city: "Lagos", area: "Lekki", country: "Nigeria", places: [{ id: "test", name: "Fixture", address: "Fixture", category: "Park", reason: "Test", distanceKm: 1, mapsUrl: "https://www.google.com/maps/", attributions: [] }] }, plans: [], warnings: [], diagnostics: [], source: "firebase", ai: false };
  const stored = JSON.stringify({ flow: "test-flow", request, result, expiresAt: 2000, accepted: true });
  assert.equal(restoreDiscoverySession(stored, "test-flow", 1000)?.accepted, true);
  assert.equal(restoreDiscoverySession(stored, "another-flow", 1000), null);
  assert.equal(restoreDiscoverySession(stored, "test-flow", 3000), null);
  assert.equal(restoreDiscoverySession("bad-json", "test-flow"), null);
});
