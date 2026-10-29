import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscoveryRanking } from "../lib/planner/discovery-ai";
import { cardSwipeMotion, rotatePlaceDeck, swipeDirection } from "../lib/planner/place-deck";
import { generateSchema, requestSchema } from "../lib/planner/schema";
import { nearbyResultSchema, nearbySearchSchema, type NearbyResult } from "../lib/maps/schema";
import { mapNearbyPlaces, placesResponseSchema } from "../lib/maps/nearby";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60000, vibes: ["Creative"], interests: "Art and pottery", date: "2026-10-31", startTime: "16:00", duration: 300 });
const result: NearbyResult = { city: "Lagos", area: "Lekki", country: "Nigeria", places: Array.from({ length: 9 }, (_, index) => ({ id: `test-${index}`, name: `Test fixture ${index}`, address: `Fixture address ${index}`, category: "Art gallery", distanceKm: index, reason: "Source reason", mapsUrl: `https://www.google.com/maps/search/?query_place_id=test-${index}`, attributions: [{ name: "Fixture attribution" }] })) };
const ranked = { headline: "A little creativity, together.", introduction: "Ideas for your creative side.", picks: result.places.slice(0, 1).map((place) => ({ id: place.id, matches: ["vibe:Creative", "interests"] })) };

test("DeepSeek returns one best-fit place while preserving canonical venue facts", () => {
  const output = applyDiscoveryRanking(result, request, { ...ranked, picks: [{ ...ranked.picks[0], id: "test-8" }] });
  assert.equal(output?.ai, true);
  assert.equal(output?.places.length, 1);
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
test("swiping cycles through every card in both directions without removing recommendations", () => {
  const places = result.places.slice(0, 3);
  for (let position = -30; position <= 30; position++) {
    const deck = rotatePlaceDeck(places, position);
    assert.equal(deck.length, 3);
    assert.deepEqual(new Set(deck.map((place) => place.id)), new Set(places.map((place) => place.id)));
    assert.equal(deck[0], places[((position % 3) + 3) % 3]);
  }
  assert.deepEqual(rotatePlaceDeck(places, 3), places);
  assert.deepEqual(rotatePlaceDeck(places, -3), places);
  assert.deepEqual(rotatePlaceDeck(places, NaN), places);
  assert.deepEqual(rotatePlaceDeck([places[0]], 100), [places[0]]);
  assert.deepEqual(rotatePlaceDeck([], 1), []);
  assert.equal(result.places.length, 9);
});
test("long swipes stay visually bounded while raw gesture distance determines navigation", () => {
  for (const width of [240, 310, 350, 500]) {
    for (const delta of [-5000, -500, 500, 5000]) {
      const motion = cardSwipeMotion(delta, { width, height: 476, availableWidth: width + 80 });
      assert.ok(Math.abs(motion.x) <= 64);
      assert.ok(Math.abs(motion.x) <= width * .18);
      assert.ok(Math.abs(motion.rotation) <= 3);
      assert.equal(Math.sign(motion.x), Math.sign(delta));
      assert.equal(swipeDirection(delta, 0, width), delta < 0 ? "next" : "previous");
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
  assert.equal(swipeDirection(100, 5, 330), "previous");
  assert.equal(swipeDirection(-130, 5, 500), "next");
  for (const values of [[20, 0, 330], [90, 160, 330], [200, 0, 0], [NaN, 0, 330]]) {
    assert.equal(swipeDirection(values[0], values[1], values[2]), null);
  }
});
test("AI output cannot include a second recommendation or comparison list", () => {
  assert.equal(applyDiscoveryRanking(result, request, { ...ranked, picks: [ranked.picks[0], { ...ranked.picks[0], id: "test-1" }] }), null);
  const first = applyDiscoveryRanking(result, request, ranked)!;
  const next = applyDiscoveryRanking(result, request, { ...ranked, picks: [{ ...ranked.picks[0], id: "test-1" }] }, [first.places[0].id]);
  assert.equal(next?.places.length, 1);
  assert.notEqual(next?.places[0].id, first.places[0].id);
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
