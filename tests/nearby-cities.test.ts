import { test } from "node:test";
import assert from "node:assert/strict";
import cityData from "../lib/maps/data/cities.json";
import { cityRecordSchema, citySearchSchema, nearbyCities, type CityRecord } from "../lib/maps/cities";

test("city suggestions exclude the current city, aliases, foreign cities, duplicates and distant destinations", () => {
  const records: CityRecord[] = [
    ["home", "Origin", "NG", 0, 0],
    ["alias", "Origin alias", "NG", 0, 1],
    ["neighborhood", "Nearby district", "NG", 0, .1],
    ["far", "Far away", "NG", 0, 3],
    ["foreign", "Across the border", "BJ", 0, .4],
    ["second", "Second city", "NG", 0, 1],
    ["closest", "Closest city", "NG", 0, .3],
    ["duplicate", "CLOSEST CITY", "NG", 0, .4],
    ["invalid", "Invalid coordinates", "NG", 100, 0],
  ];
  const result = nearbyCities(records, { lat: 0, lng: 0 }, "Origin", "NG", ["Origin alias"]);
  assert.deepEqual(result.cities.map((city) => city.id), ["closest", "second"]);
  assert.deepEqual(result.cities.map((city) => city.distanceKm), [33, 111]);
});

test("real city records give different nearby destinations for Lagos and Abuja, with no invented fallback", () => {
  const records = cityRecordSchema.array().parse(cityData);
  const lagos = nearbyCities(records, { lat: 6.6137395, lng: 3.3552568 }, "Lagos", "NG");
  const abuja = nearbyCities(records, { lat: 9.0765, lng: 7.3986 }, "Abuja", "NG");
  assert.equal(lagos.cities.length, 6);
  assert.ok(lagos.cities.some((city) => city.name === "Abeokuta"));
  assert.ok(abuja.cities.some((city) => city.name === "Suleja"));
  assert.notDeepEqual(lagos.cities, abuja.cities);
  assert.ok([...lagos.cities, ...abuja.cities].every((city) => city.distanceKm >= 25 && city.distanceKm <= 250));
  assert.deepEqual(nearbyCities(records, { lat: 0, lng: 0 }, "Unknown", "XX").cities, []);
});

test("nearby city searches validate and trim the starting city and country", () => {
  assert.deepEqual(citySearchSchema.parse({ city: " Lagos ", country: " Nigeria " }), { city: "Lagos", country: "Nigeria" });
  assert.equal(citySearchSchema.safeParse({ city: "", country: "Nigeria" }).success, false);
  assert.equal(citySearchSchema.safeParse({ city: "Lagos", country: "x".repeat(81) }).success, false);
});
