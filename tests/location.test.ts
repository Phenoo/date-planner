import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveryQuery, geocodeResponseSchema, locationFromGeocode } from "../lib/maps/location";
import { nearbySearchSchema } from "../lib/maps/schema";
import { diversePlaces, mapNearbyPlaces, placesResponseSchema, placeTypeGroups, preferredPlaceTypes } from "../lib/maps/nearby";

test("reverse geocoding chooses neighborhood and city by type, without returning an exact address", () => {
  const data = geocodeResponseSchema.parse({ status: "OK", results: [{ address_components: [
    { long_name: "Private street", types: ["route"] },
    { long_name: "Lagos State", types: ["administrative_area_level_1"] },
    { long_name: "Lekki Phase I", types: ["neighborhood"] },
    { long_name: "Lagos", types: ["locality"] },
    { long_name: "Nigeria", types: ["country"] },
  ] }] });
  const location = locationFromGeocode(data);
  assert.deepEqual(location?.location, { area: "Lekki Phase I", city: "Lagos", country: "Nigeria" });
  assert.deepEqual(location?.suggestedAreas, ["Lekki Phase I"]);
  assert.ok(!JSON.stringify(location).includes("Private street"));
  assert.equal(locationFromGeocode(geocodeResponseSchema.parse({ status: "ZERO_RESULTS" })), null);
  assert.equal(locationFromGeocode(geocodeResponseSchema.parse({ status: "OK", results: [] })), null);
});

const request = nearbySearchSchema.parse({ area: "Lekki", city: "Lagos", country: "Nigeria", maxDistance: 5, vibes: ["Creative"] });
const origin = { lat: 6.44, lng: 3.47 };
const place = (id: string, type = "art_gallery", lat = 6.441, status = "OPERATIONAL") => ({ id, displayName: { text: `Test fixture ${id}` }, formattedAddress: "Test address", types: [type], businessStatus: status, location: { latitude: lat, longitude: 3.47 } });

test("city discovery uses the chosen destination rather than the detected neighborhood", () => {
  const citySearch = nearbySearchSchema.parse({ ...request, area: "Osapa London", city: "Abuja", locationScope: "city" });
  assert.equal(discoveryQuery(citySearch), "Abuja, Nigeria");
  assert.equal(discoveryQuery({ ...citySearch, city: "Lagos", locationScope: "area" }), "Osapa London, Lagos, Nigeria");
  assert.equal(request.locationScope, "area");
});

test("city discovery preserves provider ranking while neighborhood discovery favors distance", () => {
  const data = placesResponseSchema.parse({ places: [place("popular", "art_gallery", 6.46), place("closest")] });
  assert.deepEqual(mapNearbyPlaces(data, origin, { ...request, locationScope: "city" }).places.map((item) => item.id), ["popular", "closest"]);
  assert.deepEqual(mapNearbyPlaces(data, origin, request).places.map((item) => item.id), ["closest", "popular"]);
});

test("nearby results exclude closed and distant places, deduplicate and retain category variety", () => {
  const data = placesResponseSchema.parse({ places: [place("art-1"), place("art-1"), place("art-2"), place("dining", "restaurant"), place("closed", "art_gallery", 6.441, "CLOSED_PERMANENTLY"), place("far", "art_gallery", 8)] });
  const result = mapNearbyPlaces(data, origin, request);
  assert.deepEqual(result.places.slice(0, 2).map((item) => item.id), ["art-1", "dining"]);
  assert.equal(result.places.length, 3);
  assert.ok(result.places.every((item) => item.distanceKm <= 5));
  assert.equal(new URL(result.places[0].mapsUrl).searchParams.get("query_place_id"), "art-1");
  assert.ok(result.places.every((item) => !("price" in item) && !("available" in item)));
});

test("restaurant exclusions apply to both the Places query and its returned records", () => {
  const search = { ...request, avoidRestaurants: true };
  assert.ok(!preferredPlaceTypes(search).includes("restaurant"));
  assert.ok(!preferredPlaceTypes(search).includes("cafe"));
  const result = mapNearbyPlaces(placesResponseSchema.parse({ places: [place("gallery"), place("food", "restaurant")] }), origin, search);
  assert.deepEqual(result.places.map((item) => item.id), ["gallery"]);
});

test("broad city searches include dining, scenery and entertainment without defaulting to galleries", () => {
  const romantic = { ...request, vibes: ["Romantic"] as const };
  const search = nearbySearchSchema.parse(romantic);
  const types = placeTypeGroups(search).flat();
  for (const type of ["restaurant", "park", "beach", "movie_theater", "amusement_center"]) assert.ok(types.includes(type));
  assert.ok(!types.includes("art_gallery"));
  assert.ok(!types.includes("museum"));
  const noFood = placeTypeGroups({ ...search, includeFood: false }).flat();
  assert.ok(!noFood.includes("restaurant"));
  assert.ok(!noFood.includes("cafe"));
  assert.ok(placeTypeGroups(request).flat().includes("art_gallery"));
});

test("words like partner, party and karting do not accidentally become an interest in art", () => {
  for (const interests of ["My partner loves good food", "A birthday party", "Go-karting and games", "Good food, no galleries"]) {
    const types = preferredPlaceTypes({ ...request, vibes: [], interests });
    assert.ok(!types.includes("art_gallery"));
    assert.ok(!types.includes("museum"));
  }
  assert.ok(preferredPlaceTypes({ ...request, vibes: [], interests: "Art and pottery" }).includes("art_gallery"));
});

test("fallback recommendations retain variety without fabricating or duplicating places", () => {
  const places = ["Art gallery", "Museum", "Art gallery", "Cafe", "Italian restaurant", "Park", "Cinema"].map((category, index) => ({ id: String(index), category }));
  assert.deepEqual(diversePlaces(places).map((place) => place.id), ["0", "3", "5"]);
  assert.deepEqual(diversePlaces([places[0], places[0]]), [places[0]]);
  assert.deepEqual(diversePlaces([]), []);
});

test("explicitly excluded activities stay out of searches and returned candidates", () => {
  for (const preferences of [{ interests: "My partner loves good food, no galleries." }, { dislikes: "Art galleries" }, { notes: "Avoid galleries but include restaurants." }]) {
    const search = { ...request, ...preferences };
    assert.ok(!placeTypeGroups(search).flat().includes("art_gallery"));
    assert.ok(placeTypeGroups(search).flat().includes("restaurant"));
    const data = placesResponseSchema.parse({ places: [place("gallery"), place("restaurant", "restaurant"), place("park", "park")] });
    assert.deepEqual(new Set(mapNearbyPlaces(data, origin, search).places.map((item) => item.id)), new Set(["restaurant", "park"]));
  }
});
