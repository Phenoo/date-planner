import test from "node:test";
import assert from "node:assert/strict";
import { countryFromHeaders, countryEstimateSchema } from "../lib/maps/country";
import { resolveCountry } from "../lib/maps/client-location";

const countries = [{ code: "NG", name: "Nigeria" }, { code: "GH", name: "Ghana" }, { code: "GB", name: "United Kingdom" }];

test("country estimation reads only the hosting country header without a GPS or IP lookup", () => {
  const country = countryFromHeaders({ get(name) { assert.equal(name, "x-vercel-ip-country"); return " gh "; } }, countries);
  assert.deepEqual(country, { code: "GH", name: "Ghana" });
  assert.deepEqual(countryFromHeaders(new Headers({ "x-vercel-ip-country": "GB" }), countries), countries[2]);
});

test("absent, invalid and unsupported country headers stay unknown instead of guessing Nigeria", () => {
  for (const value of ["", "XX", "USA", "US,NG", "../NG", "<script>"]) {
    assert.equal(countryFromHeaders(new Headers({ "x-vercel-ip-country": value }), countries), null);
  }
  assert.equal(countryFromHeaders(new Headers(), countries), null);
  assert.equal(countryFromHeaders(new Headers({ "country": "GH" }), countries), null);
  assert.equal(countryEstimateSchema.safeParse({ country: { code: "INVALID", name: "Invalid" } }).success, false);
});

test("the client can receive a country without browser location permission and does not cache it", async () => {
  const result = await resolveCountry(new AbortController().signal, async (url, init) => {
    assert.equal(url, "/api/country");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.body, undefined);
    return Response.json({ country: countries[1] });
  });
  assert.deepEqual(result, countries[1]);
  assert.equal(await resolveCountry(new AbortController().signal, async () => Response.json({ country: null })), null);
  await assert.rejects(resolveCountry(new AbortController().signal, async () => Response.json({}, { status: 503 })), /unavailable/);
});

test("cancelled country requests cannot return a late estimate", async () => {
  const controller = new AbortController();
  await assert.rejects(resolveCountry(controller.signal, async () => {
    controller.abort();
    return Response.json({ country: countries[1] });
  }), { name: "AbortError" });
  const alreadyCancelled = new AbortController(); alreadyCancelled.abort();
  let fetched = false;
  await assert.rejects(resolveCountry(alreadyCancelled.signal, async () => { fetched = true; return Response.json({ country: null }); }), { name: "AbortError" });
  assert.equal(fetched, false);
});
