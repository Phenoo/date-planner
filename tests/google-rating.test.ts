import test from "node:test";
import assert from "node:assert/strict";
import { hasQualifyingGoogleRating, minimumGoogleRating } from "../lib/maps/recommendation-quality";
import { mapNearbyPlaces, placesResponseSchema } from "../lib/maps/nearby";
import { nearbyResultSchema, nearbySearchSchema } from "../lib/maps/schema";
import { fitsVenueRequest, providerFactsSchema, venueRequestIssues } from "../lib/maps/venue-facts";
import { searchFeedback } from "../lib/planner/search-feedback";
import { requestSchema } from "../lib/planner/schema";

const origin = { lat: 6.45, lng: 3.46 };
const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Casual date", budget: null, vibes: ["Relaxed"], date: "2030-11-02", startTime: "14:00", durationMode: "estimated" });
const place = { id: "fixture", displayName: { text: "Fixture gallery" }, businessStatus: "OPERATIONAL", types: ["art_gallery"], location: { latitude: origin.lat, longitude: origin.lng } };
const search = (records: unknown[], date = request.date) => mapNearbyPlaces(placesResponseSchema.parse({ places: records }), origin, nearbySearchSchema.parse({ ...request, date }), 24);

test("Google average ratings must be finite and strictly above 3.75 without rounding", () => {
  assert.equal(minimumGoogleRating, 3.75);
  for (const rating of [undefined, null, "4.5", 0, -1, 3.74, 3.75, NaN, Infinity, -Infinity, 5.01]) {
    assert.equal(hasQualifyingGoogleRating(rating), false, `Unexpected qualifying rating: ${String(rating)}`);
  }
  for (const rating of [3.7501, 3.8, 3.9, 4, 4.5, 5]) assert.equal(hasQualifyingGoogleRating(rating), true);
});

test("candidate searches exclude missing and low ratings even when the date is undecided", () => {
  const records = [{ ...place, id: "missing" }, { ...place, id: "below", rating: 3.7 }, { ...place, id: "boundary", rating: 3.75 }, { ...place, id: "eligible", rating: 3.8 }];
  for (const date of [request.date, ""]) {
    const result = search(records, date);
    assert.deepEqual(result.places.map(({ id }) => id), ["eligible"]);
    assert.equal(result.places[0].details?.rating, 3.8);
    assert.equal(result.searchIssues, undefined);
  }
});

test("selected five-star review snippets cannot replace the Google aggregate rating", () => {
  const reviews = [{ rating: 5, text: { text: "A positive selected review." }, authorAttribution: { displayName: "Visitor" } }];
  const result = search([{ ...place, reviews, userRatingCount: 1000 }, { ...place, id: "low", rating: 3.75, reviews, userRatingCount: 1000 }]);
  assert.equal(result.places.length, 0);
  assert.deepEqual(result.searchIssues, ["google-rating"]);
});

test("a qualifying Google average does not impose an additional review-count minimum", () => {
  const result = search([{ ...place, id: "count-omitted", rating: 4 }, { ...place, id: "one-review", rating: 4, userRatingCount: 1 }]);
  assert.deepEqual(new Set(result.places.map(({ id }) => id)), new Set(["count-omitted", "one-review"]));
});

test("fresh detailed venue facts must still meet the rating threshold", () => {
  for (const rating of [undefined, 3.7, 3.75]) {
    const facts = providerFactsSchema.parse({ rating });
    assert.deepEqual(venueRequestIssues(facts, request, 0), ["google-rating"]);
    assert.equal(fitsVenueRequest(facts, request, 0), false);
  }
  assert.equal(fitsVenueRequest(providerFactsSchema.parse({ rating: 3.8 }), request, 0), true);
});

test("rating exclusions explain the fixed quality policy without relaxing it", () => {
  const result = search([{ ...place, rating: 3.75 }]);
  assert.deepEqual(result.searchIssues, ["google-rating"]);
  assert.equal(nearbyResultSchema.safeParse(result).success, true);
  const feedback = searchFeedback("google-rating", request);
  assert.match(feedback.message, /confirmed Google average rating above 3\.75 stars/);
  assert.equal(feedback.question, "area");
  assert.match(feedback.action, /destination|distance/);
});
