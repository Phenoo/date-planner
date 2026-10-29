import test from "node:test";
import assert from "node:assert/strict";
import { directionsUrl, embedMapUrl } from "../lib/maps/urls";
import { savedDocumentId } from "../lib/firebase/paths";

const stops = [
  { lat: 6.4, lng: 3.4, demo: false },
  { lat: 6.41, lng: 3.41, demo: false },
  { lat: 6.42, lng: 3.42, demo: false },
];
test("fictional stops never generate real-world map or directions links", () => {
  const demo = [stops[0], { ...stops[1], demo: true }];
  assert.equal(directionsUrl(demo), null);
  assert.equal(embedMapUrl(demo, "public-restricted-key"), null);
  assert.equal(directionsUrl([]), null);
  assert.equal(embedMapUrl(stops, undefined), null);
});
test("map links preserve stop order, waypoints, coordinates and transport", () => {
  const url = new URL(directionsUrl(stops, true)!);
  assert.equal(url.searchParams.get("origin"), "6.4,3.4");
  assert.equal(url.searchParams.get("destination"), "6.42,3.42");
  assert.equal(url.searchParams.get("waypoints"), "6.41,3.41");
  assert.equal(url.searchParams.get("travelmode"), "walking");
  const embed = new URL(embedMapUrl(stops, "restricted-key", true, true)!);
  assert.equal(embed.pathname, "/maps/embed/v1/directions");
  assert.equal(embed.searchParams.get("mode"), "walking");
  assert.equal(embed.searchParams.get("waypoints"), "6.41,3.41");
  assert.equal(
    new URL(embedMapUrl([stops[0]], "restricted-key")!).pathname,
    "/maps/embed/v1/place",
  );
});
test("Firestore saved-plan IDs cannot introduce paths or collide across recipes", () => {
  const id = savedDocumentId("../users/someone-else/plan");
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(id, savedDocumentId("../users/someone-else/plan"));
  assert.notEqual(id, savedDocumentId("another-plan"));
});
