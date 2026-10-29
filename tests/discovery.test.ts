import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscoveryRanking } from "../lib/planner/discovery-ai";
import { cardSwipeMotion, recordPlaceChoice, remainingPlaces, swipeDecision } from "../lib/planner/place-deck";
import { generateSchema, requestSchema } from "../lib/planner/schema";
import { nearbyResultSchema, nearbySearchSchema, type NearbyResult } from "../lib/maps/schema";
import { mapNearbyPlaces, placesResponseSchema } from "../lib/maps/nearby";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60000, vibes: ["Creative"], interests: "Art and pottery", date: "2026-10-31", startTime: "16:00", duration: 300 });
const result: NearbyResult = { city: "Lagos", area: "Lekki", country: "Nigeria", places: Array.from({ length: 9 }, (_, index) => ({ id: `test-${index}`, name: `Test fixture ${index}`, address: `Fixture address ${index}`, category: "Art gallery", distanceKm: index, reason: "Source reason", mapsUrl: `https://www.google.com/maps/search/?query_place_id=test-${index}`, attributions: [{ name: "Fixture attribution" }] })) };
const ranked = { headline: "A little creativity, together.", introduction: "Ideas for your creative side.", picks: result.places.map((place) => ({ id: place.id, matches: ["vibe:Creative", "interests"] })) };

test("DeepSeek ranks a larger candidate pool down to at most three while preserving canonical place facts", () => {
  const output = applyDiscoveryRanking(result, request, { ...ranked, picks: [...ranked.picks].reverse() });
  assert.equal(output?.ai, true);
  assert.equal(output?.places.length, 3);
  assert.equal(output?.places[0].id, "test-8");
  for (const place of output!.places) {
    const source = result.places.find((item) => item.id === place.id)!;
    const { reason, story, ...facts } = place;
    const { reason: _sourceReason, story: _sourceStory, ...sourceFacts } = source;
    assert.ok(story?.moments.length);
    assert.equal(_sourceStory, undefined);
    assert.equal(_sourceReason, "Source reason");
    assert.deepEqual(facts, sourceFacts);
    assert.match(reason, /creative vibe/);
    assert.match(reason, /the things they enjoy/);
  }
  assert.equal(result.places[0].reason, "Source reason");
});
test("unknown, excluded, duplicate IDs and invented preference explanations are rejected", () => {
  const pick = ranked.picks[0];
  for (const picks of [[{ ...pick, id: "invented-venue" }], [pick, pick], [{ ...pick, matches: ["guaranteed-quiet"] }]]) {
    assert.equal(applyDiscoveryRanking(result, request, { ...ranked, picks }), null);
  }
  assert.equal(applyDiscoveryRanking(result, request, ranked, [pick.id]), null);
  assert.equal(applyDiscoveryRanking(result, request, {}), null);
});
test("valid empty AI matches stay empty rather than filling a quota", () => {
  const output = applyDiscoveryRanking(result, request, { ...ranked, picks: [] });
  assert.equal(output?.places.length, 0);
  assert.match(output?.warnings?.[0] ?? "", /No places/);
});
test("a well matched place can reference all applicable preferences without discarding the ranking", () => {
  const output = applyDiscoveryRanking(result, { ...request, quiet: true }, { ...ranked, picks: [{ id: result.places[0].id, matches: ["vibe:Creative", "interests", "occasion", "quiet", "time", "distance"] }] });
  assert.equal(output?.ai, true);
  assert.equal(output?.places.length, 1);
  assert.equal(output?.places[0].id, result.places[0].id);
});
test("all candidates are reachable, keep and skip are distinct, duplicate events are harmless, and undo restores a card", () => {
  let history = recordPlaceChoice([], result.places[0], "keep");
  history = recordPlaceChoice(history, result.places[0], "skip");
  assert.equal(history.length, 1);
  assert.equal(history[0].decision, "keep");
  history = recordPlaceChoice(history, result.places[1], "skip");
  assert.equal(remainingPlaces(result.places, history).length, 7);
  assert.equal(remainingPlaces(result.places, history.slice(0, -1))[0].id, "test-1");
  for (const place of result.places.slice(2)) history = recordPlaceChoice(history, place, "skip");
  assert.equal(remainingPlaces(result.places, history).length, 0);
  assert.equal(history.filter((choice) => choice.decision === "keep").length, 1);
  assert.equal(remainingPlaces([result.places[0]], []).length, 1);
  assert.deepEqual(remainingPlaces([], history), []);
});
test("long swipes stay visually bounded while raw gesture distance still determines keep or skip", () => {
  for (const width of [240, 310, 350, 500]) {
    for (const delta of [-5000, -500, 500, 5000]) {
      const motion = cardSwipeMotion(delta, { width, height: 476, availableWidth: width + 80 });
      assert.ok(Math.abs(motion.x) <= 64);
      assert.ok(Math.abs(motion.x) <= width * .18);
      assert.ok(Math.abs(motion.rotation) <= 3);
      assert.equal(Math.sign(motion.x), Math.sign(delta));
      assert.equal(swipeDecision(delta, 0, width), delta > 0 ? "keep" : "skip");
    }
  }
  const bounds = { width: 350, height: 476, availableWidth: 1280 };
  assert.ok(cardSwipeMotion(10, bounds).x > 0);
  assert.deepEqual(cardSwipeMotion(0, bounds), { x: 0, rotation: 0 });
  assert.deepEqual(cardSwipeMotion(NaN, bounds), { x: 0, rotation: 0 });
  assert.deepEqual(cardSwipeMotion(50, { ...bounds, width: 0 }), { x: 0, rotation: 0 });
});
test("the whole rotated card stays inside narrow and wide screens throughout a swipe", () => {
  for (const viewport of [280, 320, 360, 390, 430, 768, 1280]) {
    const width = viewport <= 700 ? Math.min(330, viewport - 80) : 350;
    for (const height of [474, 600, 900]) {
      let previousX = 0;
      for (const delta of [0, 10, 40, 80, 160, 500, 5000]) {
        const bounds = { width, height, availableWidth: viewport };
        const right = cardSwipeMotion(delta, bounds);
        const left = cardSwipeMotion(-delta, bounds);
        const angle = Math.abs(right.rotation) * Math.PI / 180;
        const rotatedHalfWidth = (width * Math.cos(angle) + height * Math.sin(angle)) / 2;
        assert.ok(right.x + rotatedHalfWidth <= viewport / 2 - 8 + 1e-6);
        assert.ok(right.x >= previousX);
        assert.ok(Math.abs(left.x + right.x) < 1e-6);
        assert.ok(Math.abs(left.rotation + right.rotation) < 1e-6);
        previousX = right.x;
      }
    }
  }
  assert.deepEqual(cardSwipeMotion(500, { width: 310, height: 474, availableWidth: 310 }), { x: 0, rotation: 0 });
});
test("swipe thresholds support phones and desktop without treating vertical scroll or short drags as decisions", () => {
  assert.equal(swipeDecision(100, 5, 330), "keep");
  assert.equal(swipeDecision(-130, 5, 500), "skip");
  for (const values of [[20, 0, 330], [90, 160, 330], [200, 0, 0], [NaN, 0, 330]]) {
    assert.equal(swipeDecision(values[0], values[1], values[2]), null);
  }
});
test("discovery removes closed, distant and excluded food venues and deduplicates the full pool", () => {
  const place = { id: "gallery", displayName: { text: "Fixture gallery" }, formattedAddress: "Fixture", businessStatus: "OPERATIONAL", types: ["art_gallery"], location: { latitude: 6.45, longitude: 3.46 } };
  const data = placesResponseSchema.parse({ places: [place, place, { ...place, id: "closed", businessStatus: "CLOSED_PERMANENTLY" }, { ...place, id: "far", location: { latitude: 8, longitude: 3 } }, { ...place, id: "food", types: ["restaurant"] }] });
  for (const flags of [{ includeFood: false }, { avoidRestaurants: true }]) {
    const search = nearbySearchSchema.parse({ ...request, ...flags });
    assert.deepEqual(mapNearbyPlaces(data, { lat: 6.45, lng: 3.46 }, search, 24).places.map((item) => item.id), ["gallery"]);
  }
});
test("fresh discovery inputs are bounded and compatible with existing requests", () => {
  const input = generateSchema.parse({ request });
  assert.deepEqual(input.excludePlaceIds, []);
  assert.deepEqual(input.likedPlaceCategories, []);
  assert.equal(generateSchema.safeParse({ request, excludePlaceIds: Array(61).fill("test") }).success, false);
  assert.equal(nearbyResultSchema.safeParse({ ...result, places: result.places.slice(0, 3) }).success, true);
  assert.equal(nearbyResultSchema.safeParse({ ...result, places: result.places.slice(0, 4) }).success, false);
});
