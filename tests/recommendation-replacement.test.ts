import test from "node:test";
import assert from "node:assert/strict";
import { recommendationExclusions, replacementPreferredIds } from "../lib/planner/recommendation-replacement";
import { mergeRejectedPicks, readRejectedPicks, rejectedPicksKey } from "../lib/planner/discovery-session";
import { draftJSON, draftMatchesFlow } from "../lib/planner/draft-retention";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { generatePlans, generateSinglePlan } from "../lib/planner/engine";
import { generateSchema, requestSchema, type RecommendationResult } from "../lib/planner/schema";
import { nearbySearchSchema } from "../lib/maps/schema";
import { mapNearbyPlaces, placesResponseSchema } from "../lib/maps/nearby";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Casual date", budget: 60000, vibes: ["Playful"], date: "2030-11-09", startTime: "16:00", duration: 180 });
const liveResult: RecommendationResult = { plans: [], warnings: [], diagnostics: [], source: "firebase", ai: false, nearby: { city: "Lagos", area: "Lekki", country: "Nigeria", places: [{ id: "current-google-place", name: "Current place", address: "Fixture", category: "Park", reason: "Fixture", distanceKm: 1, mapsUrl: "https://www.google.com/maps/", attributions: [] }] } };

test("editing a live recommendation excludes its current Google place", () => {
  assert.deepEqual(recommendationExclusions(liveResult), { excludeCategories: [], excludeIds: [], excludePlaceIds: ["current-google-place"] });
  assert.deepEqual(recommendationExclusions(null), mergeRejectedPicks());
});

test("editing a catalog plan excludes its activities and their Google venue identities", () => {
  const catalog = demoCatalog.map((experience) => ({ ...experience, placeId: `google-${experience.id}` }));
  const result = generateSinglePlan(generateSchema.parse({ request }), catalog);
  assert.equal(result.plans.length, 1);
  const exclusions = recommendationExclusions(result);
  assert.deepEqual(exclusions.excludeIds, result.plans[0].activities.map((activity) => activity.experience.id));
  assert.deepEqual(exclusions.excludePlaceIds, result.plans[0].activities.map((activity) => activity.experience.placeId));
  const next = generateSinglePlan(generateSchema.parse({ request, ...exclusions }), catalog);
  assert.equal(next.plans.length, 1);
  assert.notEqual(next.plans[0].activities[0].experience.id, result.plans[0].activities[0].experience.id);
});

test("both catalog generators exclude other experiences at the same rejected Google venue", () => {
  const template = demoCatalog.find((experience) => experience.category === "Food & dining");
  assert.ok(template);
  const current = { ...template, id: "current-experience", placeId: "shared-google-venue" };
  const sameVenue = { ...current, id: "another-experience-at-same-venue" };
  const alternative = { ...template, id: "other-venue", venue: "Another fixture venue", placeId: "other-google-venue" };
  const unmapped = { ...template, id: "unmapped-fixture", venue: "Unmapped fixture venue", placeId: undefined };
  const catalog = [current, sameVenue, alternative, unmapped];
  const input = generateSchema.parse({ request: { ...request, city: template.city, area: template.area, country: template.country, duration: 120, transport: "Walking", includeTransport: false }, excludeIds: [current.id], excludePlaceIds: [current.placeId] });
  for (const generate of [generateSinglePlan, generatePlans]) {
    const result = generate(input, catalog, undefined, template);
    assert.ok(result.plans.length > 0);
    assert.ok(result.plans.every((plan) => plan.activities.every((activity) => activity.experience.placeId !== current.placeId)));
    const rejected = result.diagnostics.find((item) => item.id === sameVenue.id);
    assert.equal(rejected?.eligible, false);
    assert.ok(rejected?.reasons.includes("Google venue excluded from this recommendation"));
    assert.equal(result.diagnostics.find((item) => item.id === unmapped.id)?.eligible, true);
  }
});

test("replacement removes excluded preferred IDs without changing other preferences", () => {
  const edited = { ...request, budget: 45000, environment: "outdoor" as const, quiet: true, accessibility: true };
  const exclusions = mergeRejectedPicks({ excludeIds: ["current-catalog-place"] });
  const preferredIds = ["current-catalog-place", "another-preference"];
  const input = generateSchema.parse({ request: edited, preferredIds: replacementPreferredIds(preferredIds, exclusions.excludeIds), ...exclusions });
  assert.deepEqual(input.preferredIds, ["another-preference"]);
  assert.deepEqual(input.request, edited);
  assert.deepEqual(preferredIds, ["current-catalog-place", "another-preference"]);
});

test("existing rejections survive editing, retries, refresh and transfer to a new flow", () => {
  const storage = new Map<string, string>();
  const oldFlow = "11111111-1111-4111-8111-111111111111";
  const newFlow = "22222222-2222-4222-8222-222222222222";
  storage.set(rejectedPicksKey(oldFlow), JSON.stringify(mergeRejectedPicks({ excludePlaceIds: ["previously-rejected"], excludeCategories: ["Museum"] })));
  const captured = mergeRejectedPicks(readRejectedPicks(storage.get(rejectedPicksKey(oldFlow)) ?? null), recommendationExclusions(liveResult));
  storage.set(rejectedPicksKey(newFlow), JSON.stringify(captured));
  const draft = JSON.parse(draftJSON({ flow: newFlow, request, editingPlan: true, plannerMode: "steps" }));
  assert.equal(draftMatchesFlow(draft, newFlow), true);
  assert.equal(draftMatchesFlow(draft, oldFlow), false);
  const refreshed = readRejectedPicks(storage.get(rejectedPicksKey(newFlow)) ?? null);
  const retry = mergeRejectedPicks(refreshed, captured, recommendationExclusions(liveResult));
  assert.deepEqual(retry.excludePlaceIds, ["previously-rejected", "current-google-place"]);
  assert.deepEqual(retry.excludeCategories, ["Museum"]);
  assert.deepEqual(readRejectedPicks(storage.get(rejectedPicksKey(oldFlow)) ?? null).excludePlaceIds, ["previously-rejected"]);
});

test("replacement does not relax the Google threshold when no qualified alternative remains", () => {
  const input = nearbySearchSchema.parse({ ...request, maxDistance: 5 });
  const record = (id: string, rating?: number) => ({ id, rating, displayName: { text: id }, formattedAddress: "Fixture", businessStatus: "OPERATIONAL", types: ["park"], location: { latitude: 6.441, longitude: 3.47 } });
  const exclusions = recommendationExclusions(liveResult);
  const candidates = placesResponseSchema.parse({ places: [record("current-google-place", 4.8), record("boundary-place", 3.75), record("unrated-place")] });
  const remaining = { places: candidates.places.filter((place) => !exclusions.excludePlaceIds.includes(place.id)) };
  const result = mapNearbyPlaces(remaining, { lat: 6.44, lng: 3.47 }, input);
  assert.deepEqual(result.places, []);
  assert.ok(result.searchIssues?.includes("google-rating"));
  assert.deepEqual(input, nearbySearchSchema.parse({ ...request, maxDistance: 5 }));
});
