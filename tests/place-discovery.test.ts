import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { cityDiscoveryResultSchema, cityDiscoverySearchSchema } from "../lib/maps/place-discovery";
import { nearbyPlaceSchema, nearbyResultSchema, placePhotoSchema } from "../lib/maps/schema";

const place = nearbyPlaceSchema.parse({
  id: "fixture", name: "Fixture gallery", address: "London", category: "Gallery", distanceKm: 1, reason: "Gallery in London.",
  mapsUrl: "https://www.google.com/maps/", attributions: [],
  details: { checkedAt: "2026-11-01T00:00:00Z", opening: "unknown", hours: [], rating: 4.5, travelMinutes: 5, reviews: [] },
});

test("city discovery accepts a bounded location/exclusion contract without weakening the three-place planner schema", () => {
  assert.deepEqual(cityDiscoverySearchSchema.parse({ city: " London ", country: " United Kingdom " }), { city: "London", country: "United Kingdom", excludeIds: [] });
  assert.deepEqual(cityDiscoverySearchSchema.parse({ city: "London", country: "United Kingdom", coordinates: { lat: 51.5, lng: -0.12 } }).coordinates, { lat: 51.5, lng: -0.12 });
  for (const input of [
    { city: "", country: "United Kingdom" },
    { city: "London", country: "a".repeat(81) },
    { city: "London", country: "United Kingdom", excludeIds: Array.from({ length: 61 }, (_, index) => `${index}`) },
    { city: "London", country: "United Kingdom", excludeIds: [""] },
    { city: "London", country: "United Kingdom", excludeIds: ["a".repeat(201)] },
    { city: "London", country: "United Kingdom", lat: 51.5, lng: -0.1 },
    { city: "London", country: "United Kingdom", coordinates: { lat: 91, lng: -0.1 } },
    { city: "London", country: "United Kingdom", coordinates: { lat: 51.5 } },
    { city: "London", country: "United Kingdom", notes: "private planning information" },
  ]) assert.equal(cityDiscoverySearchSchema.safeParse(input).success, false);
  const result = { city: "London", country: "United Kingdom", area: "London", places: Array.from({ length: 12 }, (_, index) => ({ ...place, id: `${index}` })) };
  assert.equal(cityDiscoveryResultSchema.safeParse(result).success, true);
  assert.equal(cityDiscoveryResultSchema.safeParse({ ...result, places: [...result.places, { ...place, id: "extra" }] }).success, false);
  assert.equal(nearbyResultSchema.safeParse({ ...result, places: result.places.slice(0, 4) }).success, false);
  for (const rating of [undefined, 0, 3.75, 3.7, 5.1, NaN, Infinity]) {
    assert.equal(cityDiscoveryResultSchema.safeParse({ ...result, places: [{ ...place, details: { ...place.details, rating } }] }).success, false);
  }
  for (const rating of [3.75001, 4, 5]) {
    assert.equal(cityDiscoveryResultSchema.safeParse({ ...result, places: [{ ...place, details: { ...place.details, rating } }] }).success, true);
  }
});

test("photo source links remain optional and require HTTPS", () => {
  const photo = { url: "https://lh3.googleusercontent.com/photo", authors: [{ name: "Photographer", url: "https://www.google.com/maps/contrib/123" }] };
  assert.deepEqual(placePhotoSchema.parse(photo), photo);
  const sourceUrl = "https://www.google.com/maps/contrib/123/photo/456";
  assert.equal(placePhotoSchema.parse({ ...photo, sourceUrl }).sourceUrl, sourceUrl);
  assert.equal(placePhotoSchema.safeParse({ ...photo, sourceUrl: "javascript:alert(1)" }).success, false);
});

type RouteHarness = Pick<typeof import("../app/api/discover-places/route"), "POST"> & {
  setBlocked: (ids: string[]) => void;
  setLimitStatus: (status: number) => void;
  getLimitCalls: () => number;
};

function providerPlace(id: string, rating: number | undefined = 4.5, businessStatus = "OPERATIONAL", latitude = 51.5) {
  return {
    id, displayName: { text: `Venue ${id}` }, formattedAddress: `${id}, London, United Kingdom`, primaryTypeDisplayName: { text: "Gallery" },
    types: ["art_gallery"], businessStatus, rating, userRatingCount: 120, location: { latitude, longitude: -0.12 },
    photos: [{ name: `places/${id}/photos/photo-${id}`, googleMapsUri: `https://www.google.com/maps/contrib/123/photo/${id}`, authorAttributions: [{ displayName: "Fixture photographer", uri: "https://www.google.com/maps/contrib/123" }] }],
    attributions: [{ provider: "Fixture provider", providerUri: "https://example.com/source" }],
  };
}

function request(body: unknown = { city: "London", country: "United Kingdom" }, token: string | null = "member") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://adateatlas.com/api/discover-places", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

test("authenticated city discovery reuses real Google quality filters and fails safely", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "place-discovery-test-"));
  const previousKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  let candidates = [providerPlace("qualifying", 3.76), providerPlace("five", 5), providerPlace("boundary", 3.75), providerPlace("low", 3.7), { ...providerPlace("unrated"), rating: undefined }, providerPlace("closed", 4.9, "CLOSED_PERMANENTLY"), providerPlace("blocked"), providerPlace("excluded"), providerPlace("distant", 4.8, "OPERATIONAL", 52.5)];
  let searchesFail = false;
  let photoFails = false;
  let unsafeSource: "script" | "secret" | null = null;
  const googleRequests: { url: URL; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    googleRequests.push({ url, init });
    if (url.hostname === "maps.googleapis.com" && url.pathname === "/maps/api/geocode/json") return Response.json({ status: "OK", results: [{ address_components: [], geometry: { location: { lat: 51.5, lng: -0.12 } } }] });
    if (url.hostname === "places.googleapis.com" && url.pathname === "/v1/places:searchNearby") {
      if (searchesFail) return Response.json({ error: "Provider unavailable" }, { status: 503 });
      return Response.json({ places: candidates.map((candidate) => unsafeSource ? { ...candidate, photos: candidate.photos.map((photo) => ({ ...photo, googleMapsUri: unsafeSource === "script" ? "javascript:alert(1)" : "https://www.google.com/maps/?key=fixture-private-maps-key" })) } : candidate) });
    }
    if (url.hostname === "places.googleapis.com" && url.pathname.endsWith("/media")) {
      if (photoFails) return Response.json({}, { status: 503 });
      const id = url.pathname.split("/")[3];
      return Response.json({ photoUri: `https://lh3.googleusercontent.com/${id}` });
    }
    throw new Error("Unexpected network request in isolated discovery test");
  });
  try {
    const output = join(directory, "discovery.mjs");
    await build({
      stdin: { contents: 'export { POST } from "./app/api/discover-places/route"; export { setBlocked, setLimitStatus, getLimitCalls } from "city-discovery-mock";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{
        name: "isolated-city-discovery-services",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:server-only|@\/lib\/firebase\/server|@\/lib\/planner\/rate-limit|@\/lib\/server\/venue-controls|@\/lib\/server\/planner-gateway|city-discovery-mock)$/ }, () => ({ path: "city-discovery-mock", namespace: "city-discovery" }));
          plugin.onLoad({ filter: /.*/, namespace: "city-discovery" }, () => ({
            contents: `import { RequestError } from "@/lib/planner/http";
              import { discoverPlaces } from "@/lib/server/actions/discover-places";
              let blocked = []; let limitStatus = 0; let limitCalls = 0;
              export function setBlocked(ids) { blocked = ids; }
              export function setLimitStatus(status) { limitStatus = status; }
              export function getLimitCalls() { return limitCalls; }
              export async function authenticatedClient(request) { const token = request.headers.get("authorization"); return token ? { user: { uid: "fixture-user", firebase: { sign_in_provider: token === "Bearer anonymous" ? "anonymous" : "google.com" } } } : null; }
              export async function enforcePlannerLimit() { limitCalls++; if (limitStatus) throw new RequestError("Please wait a minute and try again.", limitStatus); }
              export async function venueControls() { return new Set(blocked); }
              export async function plannerAction(action, request) { if (action !== "discoverPlaces") throw new Error("Wrong gateway action"); return discoverPlaces(request); }`,
            loader: "js", resolveDir: process.cwd(),
          }));
        },
      }],
    });
    const { POST, setBlocked, setLimitStatus, getLimitCalls }: RouteHarness = await import(pathToFileURL(output).href);
    process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-private-maps-key";
    setBlocked(["blocked"]);

    await t.test("members receive only rated, operational, nearby and non-excluded venues with attributed hero photos", async () => {
      const response = await POST(request({ city: "London", country: "United Kingdom", excludeIds: ["excluded"] }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const data = cityDiscoveryResultSchema.parse(await response.json());
      assert.deepEqual(data.places.map((place) => place.id), ["qualifying", "five"]);
      assert.equal(data.places[0].details?.rating, 3.76);
      assert.equal(data.places[0].details?.opening, "unknown");
      assert.equal(data.places[0].reason, "Gallery in London.");
      assert.equal(data.places[0].photo?.sourceUrl, "https://www.google.com/maps/contrib/123/photo/qualifying");
      assert.deepEqual(data.places[0].photo?.authors, [{ name: "Fixture photographer", url: "https://www.google.com/maps/contrib/123" }]);
      assert.deepEqual(data.places[0].attributions, [{ name: "Fixture provider", url: "https://example.com/source" }]);
      assert.equal(getLimitCalls(), 1);
      assert.ok(!JSON.stringify(data).includes("fixture-private-maps-key"));
      const geocode = googleRequests.find(({ url }) => url.hostname === "maps.googleapis.com");
      assert.equal(geocode?.url.searchParams.get("address"), "London, United Kingdom");
      const searches = googleRequests.filter(({ url }) => url.pathname === "/v1/places:searchNearby");
      assert.equal(searches.length, 4);
      assert.equal(JSON.parse(String(searches[0].init.body)).rankPreference, "POPULARITY");
      assert.equal(JSON.parse(String(searches[0].init.body)).locationRestriction.circle.radius, 25000);
      assert.ok(!googleRequests.some(({ init }) => new Headers(init.headers).has("Authorization")));
      const photos = googleRequests.filter(({ url }) => url.pathname.endsWith("/media"));
      assert.equal(photos.length, 2);
      assert.ok(photos.every(({ url }) => /places\/(qualifying|five)\//.test(url.pathname)));
    });

    await t.test("guest identities can browse without creating an account", async () => {
      const response = await POST(request(undefined, "anonymous"));
      assert.equal(response.status, 200);
      const data = cityDiscoveryResultSchema.parse(await response.json());
      assert.deepEqual(data.places.map((place) => place.id), ["qualifying", "five", "excluded"]);
    });

    await t.test("device coordinates drive nearby searches directly instead of geocoding the city centre", async () => {
      const before = googleRequests.length;
      const coordinates = { lat: 51.501, lng: -0.121 };
      const response = await POST(request({ city: "London", country: "United Kingdom", coordinates }, "anonymous"));
      assert.equal(response.status, 200);
      const raw: unknown = await response.json();
      assert.ok(raw && typeof raw === "object" && !("coordinates" in raw));
      const data = cityDiscoveryResultSchema.parse(raw);
      assert.ok(data.places.length > 0);
      const requests = googleRequests.slice(before);
      assert.ok(!requests.some(({ url }) => url.hostname === "maps.googleapis.com"));
      const searches = requests.filter(({ url }) => url.pathname === "/v1/places:searchNearby");
      assert.ok(searches.length > 0);
      for (const { init } of searches) {
        const body = JSON.parse(String(init.body));
        assert.deepEqual(body.locationRestriction.circle.center, { latitude: coordinates.lat, longitude: coordinates.lng });
        assert.equal(body.rankPreference, "DISTANCE");
      }
    });

    await t.test("missing identities cannot run provider requests", async () => {
      const before = googleRequests.length;
      assert.equal((await POST(request(undefined, null))).status, 401);
      assert.equal(googleRequests.length, before);
    });

    await t.test("invalid, oversized and rate-limited requests never reach Google", async () => {
      const before = googleRequests.length;
      assert.equal((await POST(request({ city: "", country: "United Kingdom" }))).status, 400);
      assert.equal((await POST(request({ city: "London", country: "United Kingdom", excludeIds: Array(61).fill("fixture") }))).status, 400);
      assert.equal((await POST(request("{"))).status, 400);
      assert.equal((await POST(request(" ".repeat(18001)))).status, 413);
      setLimitStatus(429);
      const limited = await POST(request());
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("Cache-Control"), "no-store");
      assert.equal((await POST(request(undefined, "anonymous"))).status, 429);
      setLimitStatus(0);
      assert.equal(googleRequests.length, before);
    });

    await t.test("the feed is bounded to twelve distinct real candidates", async () => {
      candidates = Array.from({ length: 20 }, (_, index) => providerPlace(`valid-${index}`));
      const data = cityDiscoveryResultSchema.parse(await (await POST(request())).json());
      assert.equal(data.places.length, 12);
      assert.equal(new Set(data.places.map((place) => place.id)).size, 12);
    });

    await t.test("failed photos and unsafe source URLs leave real venues available without invented imagery", async () => {
      photoFails = true;
      let data = cityDiscoveryResultSchema.parse(await (await POST(request())).json());
      assert.ok(data.places.length > 0);
      assert.ok(data.places.every((place) => !place.photo));
      photoFails = false;
      for (const source of ["script", "secret"] as const) {
        unsafeSource = source;
        data = cityDiscoveryResultSchema.parse(await (await POST(request())).json());
        assert.ok(data.places.every((place) => place.photo && !place.photo.sourceUrl));
        assert.ok(!JSON.stringify(data).includes("fixture-private-maps-key"));
      }
      unsafeSource = null;
    });

    await t.test("unrated/boundary-only results return an honest empty feed and provider outages return an error", async () => {
      candidates = [providerPlace("boundary", 3.75), { ...providerPlace("unrated"), rating: undefined }];
      const empty = cityDiscoveryResultSchema.parse(await (await POST(request())).json());
      assert.deepEqual(empty.places, []);
      assert.deepEqual(empty.searchIssues, ["google-rating"]);
      searchesFail = true;
      const unavailable = await POST(request());
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
      assert.match((await unavailable.json()).error, /couldn't be loaded/);
    });
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY;
    else process.env.GOOGLE_MAPS_SERVER_KEY = previousKey;
    await rm(directory, { recursive: true, force: true });
  }
});
