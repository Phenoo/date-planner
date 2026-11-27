import test from "node:test";
import assert from "node:assert/strict";
import { nearbyPlaceSchema } from "../lib/maps/schema";
import { filterDiscoveryPlaces } from "../lib/maps/discovery-filters";

const places = [
  { id: "dinner", name: "The Garden Table", category: "Restaurant", distanceKm: 2 },
  { id: "art", name: "City Gallery", category: "Art gallery", distanceKm: 4 },
  { id: "coffee", name: "Slow mornings", category: "Café", distanceKm: 8 },
  { id: "apartments", name: "Smart apartments", category: "Lodging", distanceKm: 1 },
].map(place => nearbyPlaceSchema.parse({ ...place, address: "Lagos, Nigeria", reason: "Test fixture", mapsUrl: "https://www.google.com/maps/", attributions: [] }));

test("discovery combines category, trimmed search and distance without changing the collection", () => {
  const filtered = filterDiscoveryPlaces(places, { category: "For you", query: "  LAGOS ", radius: 4 });
  assert.deepEqual(filtered.map(place => place.id), ["dinner", "art", "apartments"]);
  assert.equal(places.length, 4);
  assert.deepEqual(filterDiscoveryPlaces(places, { category: "Dinner", query: "garden", radius: 2 }).map(place => place.id), ["dinner"]);
  assert.deepEqual(filterDiscoveryPlaces(places, { category: "Dinner", query: "gallery", radius: 50 }), []);
});

test("playful category matches whole activity words rather than unrelated substrings", () => {
  assert.deepEqual(filterDiscoveryPlaces(places, { category: "Playful", query: "", radius: 50 }).map(place => place.id), ["art"]);
});

test("slow days includes accented cafés and respects the selected radius", () => {
  assert.deepEqual(filterDiscoveryPlaces(places, { category: "Slow days", query: "slow", radius: 10 }).map(place => place.id), ["coffee"]);
  assert.deepEqual(filterDiscoveryPlaces(places, { category: "Slow days", query: "slow", radius: 5 }), []);
});
