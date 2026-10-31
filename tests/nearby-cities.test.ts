import { test } from "node:test";
import assert from "node:assert/strict";
import cityData from "../lib/maps/data/cities.json";
import { cityRecordSchema, citySearchSchema, nearbyCities, countryCitiesSchema, citiesForCountry, manualCitySuggestions, type CityRecord } from "../lib/maps/cities";

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

test("manual country selection uses actual country records instead of Nigerian defaults", () => {
  const records = cityRecordSchema.array().parse(cityData);
  for (const country of ["Ghana", "United Kingdom", "France", "Nigeria"]) {
    const result = countryCitiesSchema.parse(citiesForCountry(records, country));
    assert.equal(result.country?.name, country);
    assert.ok(result.cities.length > 0);
    assert.ok(result.cities.every((record) => record[2] === result.country?.code));
  }
  assert.equal(citiesForCountry(records, " GH ").country?.name, "Ghana");
  assert.equal(citiesForCountry(records, "UK").country?.code, "GB");
  assert.equal(citiesForCountry(records, "USA").country?.code, "US");
  const unknown = citiesForCountry(records, "A country that does not exist");
  assert.equal(unknown.country, null);
  assert.deepEqual(unknown.cities, []);
  assert.ok(unknown.countries.some(({ name }) => name === "Nigeria"));
});

test("manual suggestions rank by device distance, remain inside the country and never exceed three", () => {
  const records: CityRecord[] = [
    ["a", "Alpha", "GH", 0, 1], ["b", "Bravo", "GH", 0, 2],
    ["c", "Charlie", "GH", 0, 3], ["d", "Delta", "GH", 0, 4],
    ["foreign", "Lagos", "NG", 0, 1.1], ["duplicate", "ALPHA", "GH", 0, 1.05],
    ["invalid", "Invalid", "GH", 100, 1],
  ];
  assert.deepEqual(manualCitySuggestions(records, "GH", "", { lat: 0, lng: 1 }).map(({ id }) => id), ["a", "b", "c"]);
  assert.deepEqual(manualCitySuggestions(records, "GH", "", { lat: 0, lng: 4 }).map(({ id }) => id), ["d", "c", "b"]);
  assert.equal(manualCitySuggestions(records, "GH", "", { lat: 0, lng: 1 })[0].distanceKm, 0);
  assert.ok(manualCitySuggestions(records, "GH", "").every((item) => item.distanceKm === undefined));
});

test("manual city searches filter typed names without location access and support accents", () => {
  const records: CityRecord[] = [["one", "Accra", "GH", 5.55, -.2], ["two", "Cape Coast", "GH", 5.1, -1.25], ["three", "Córdoba", "ES", 37.88, -4.78]];
  assert.deepEqual(manualCitySuggestions(records, "GH", " accr ").map(({ name }) => name), ["Accra"]);
  assert.deepEqual(manualCitySuggestions(records, "ES", "Cord").map(({ name }) => name), ["Córdoba"]);
  assert.deepEqual(manualCitySuggestions(records, "GH", "Lagos"), []);
  assert.deepEqual(manualCitySuggestions(records, "XX", ""), []);
});
