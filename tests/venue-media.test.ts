import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { nearbyPlaceSchema, type NearbyResult } from "../lib/maps/schema";
import { placesResponseSchema } from "../lib/maps/nearby";
import { invitationPlaceSchema } from "../lib/planner/invitations";
import { requestSchema } from "../lib/planner/schema";

type MediaHarness = Pick<typeof import("../lib/maps/photos"), "placePhoto" | "placePhotos">
  & Pick<typeof import("../lib/maps/place-details"), "loadPlaceDetails">
  & Pick<typeof import("../lib/maps/places"), "attachPlacePhotos">
  & Pick<typeof import("../lib/server/date-discovery"), "discoverDatePlaces">;

const fixtureKey = "fixture-google-key";
const description = "  A gallery with modern art, sculpture and changing exhibitions.\nGoogle's exact summary.  ";
const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Casual date", budget: null, vibes: ["Creative"], date: "2030-11-02", startTime: "14:00", durationMode: "estimated" });
const candidate = { id: "fixture", name: "Fixture gallery", address: "Fixture address", category: "Gallery", distanceKm: 1, reason: "For your creative side.", mapsUrl: "https://www.google.com/maps/", attributions: [] };
const candidates: NearbyResult = { city: "Lagos", area: "Lekki", country: "Nigeria", places: [candidate, { ...candidate, id: "unchosen" }] };
const sources = (id = "fixture") => Array.from({ length: 8 }, (_, index) => ({ name: `places/${id}/photos/photo${index}`, authorAttributions: [{ displayName: `Photographer ${index}`, uri: index === 1 ? "javascript:unsafe()" : `//maps.google.com/contrib/author${index}` }] }));
const record = (id: string, rating: number) => ({ id, displayName: { text: "Fresh fixture gallery" }, formattedAddress: "Fresh fixture address", businessStatus: "OPERATIONAL", rating, userRatingCount: 120, types: ["art_gallery"], location: { latitude: 6.45, longitude: 3.46 }, photos: sources(id), editorialSummary: { text: description, languageCode: "en" } });

test("venue media is attributed, bounded and loaded only for the selected venue", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "venue-media-test-"));
  const originalFetch = globalThis.fetch;
  try {
    const output = join(directory, "media.mjs");
    await build({
      stdin: { contents: 'export { placePhoto, placePhotos } from "./lib/maps/photos"; export { loadPlaceDetails } from "./lib/maps/place-details"; export { attachPlacePhotos } from "./lib/maps/places"; export { discoverDatePlaces } from "./lib/server/date-discovery";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "isolated-media-providers", setup(plugin) {
        plugin.onResolve({ filter: /^(?:server-only|\.\/google|@\/lib\/server\/venue-controls|@\/lib\/planner\/discovery-ai|@\/lib\/maps\/places)$/ }, () => ({ path: "fixture-providers", namespace: "media-fixture" }));
        plugin.onLoad({ filter: /.*/, namespace: "media-fixture" }, () => ({ loader: "js", contents: `
          export function mapsServerKey() { return ${JSON.stringify(fixtureKey)}; }
          export function geocodeLocation() { throw new Error("Unexpected fixture geocode"); }
          export async function venueControls() { return new Set(); }
          export async function createDiscoveryBrief() { return null; }
          export async function rankDiscoveredPlaces(result) { return { ...result, places: result.places.slice(0, 1) }; }
          export async function loadPlaceCandidates() { return { records: [], result: ${JSON.stringify(candidates)} }; }
        ` }));
      } }],
    });
    const media: MediaHarness = await import(pathToFileURL(output).href);
    let rating = 4.6;
    let brokenMedia = false;
    let allMediaUnavailable = false;
    let officialWebsite: string | undefined = "https://www.instagram.com/fixture.gallery/?hl=en";
    const calls: { url: URL; headers: Headers; redirect: RequestRedirect | undefined }[] = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert.equal(url.origin, "https://places.googleapis.com");
      calls.push({ url, headers: new Headers(init?.headers), redirect: init?.redirect });
      if (!url.pathname.endsWith("/media")) return Response.json({ ...record(url.pathname.split("/").at(-1) ?? "fixture", rating), ...(officialWebsite ? { websiteUri: officialWebsite } : {}) });
      if (allMediaUnavailable) return new Response(null, { status: 404 });
      const photo = url.pathname.split("/").at(-2);
      if (brokenMedia && photo === "photo0") throw new Error("Fixture network failure");
      if (brokenMedia && photo === "photo1") return new Response(null, { status: 404 });
      if (brokenMedia && photo === "photo2") return Response.json({ photoUri: "https://lh3.googleusercontent.com.evil.test/image" });
      if (brokenMedia && photo === "photo3") return Response.json({ photoUri: `https://lh3.googleusercontent.com/${fixtureKey}` });
      if (brokenMedia && photo === "photo4") return new Response("invalid JSON");
      return Response.json({ photoUri: `https://lh3.googleusercontent.com/${photo}` });
    };
    const mediaCalls = () => calls.filter(({ url }) => url.pathname.endsWith("/media"));

    await t.test("gallery requests are deduplicated, capped at six, and never expose the server key", async () => {
      calls.length = 0;
      const gallery = await media.placePhotos([...sources(), sources()[0]]);
      assert.equal(gallery.length, 6);
      assert.equal(mediaCalls().length, 6);
      assert.deepEqual(gallery[0].authors, [{ name: "Photographer 0", url: "https://maps.google.com/contrib/author0" }]);
      assert.deepEqual(gallery[1].authors, [{ name: "Photographer 1" }]);
      for (const call of calls) {
        assert.equal(call.headers.get("X-Goog-Api-Key"), fixtureKey);
        assert.equal(call.url.searchParams.has("key"), false);
        assert.equal(call.redirect, "error");
      }
      assert.ok(!JSON.stringify(gallery).includes(fixtureKey));
      calls.length = 0;
      assert.equal(await media.placePhoto({ name: "https://untrusted.test/photo", authorAttributions: [] }), undefined);
      assert.equal(calls.length, 0);
    });

    await t.test("individual media failures and unsafe URIs do not fail the remaining gallery", async () => {
      calls.length = 0; brokenMedia = true;
      const gallery = await media.placePhotos(sources());
      assert.equal(mediaCalls().length, 6);
      assert.deepEqual(gallery.map(({ url }) => url), ["https://lh3.googleusercontent.com/photo5"]);
      brokenMedia = false;
    });

    await t.test("quality-only detail lookups request neither media nor rich summary fields", async () => {
      calls.length = 0;
      const details = await media.loadPlaceDetails("fixture", false);
      assert.equal(mediaCalls().length, 0);
      assert.equal(calls.length, 1);
      assert.ok(!calls[0].headers.get("X-Goog-FieldMask")?.split(",").includes("editorialSummary"));
      assert.ok(!calls[0].headers.get("X-Goog-FieldMask")?.split(",").includes("photos"));
      assert.equal(details.place.photo, undefined);
      assert.equal(details.place.photos, undefined);
    });

    await t.test("selected details retain attributed photos through invitation validation and preserve the hero alias", async () => {
      calls.length = 0;
      const details = await media.loadPlaceDetails("fixture");
      assert.equal(mediaCalls().length, 6);
      assert.ok(calls[0].headers.get("X-Goog-FieldMask")?.split(",").includes("editorialSummary"));
      assert.equal(details.record.editorialSummary?.text, description);
      assert.equal(details.place.photos?.length, 6);
      assert.deepEqual(details.place.photo, details.place.photos?.[0]);
      assert.equal(invitationPlaceSchema.parse(details.place).photos?.length, 6);
      assert.ok(!JSON.stringify(details.place).includes(fixtureKey));
    });

    await t.test("saved-date thumbnails load one attributed photo without a full gallery or rich summary", async () => {
      calls.length = 0;
      const details = await media.loadPlaceDetails("fixture", "hero");
      assert.equal(mediaCalls().length, 1);
      assert.equal(calls.length, 2);
      assert.ok(calls[0].headers.get("X-Goog-FieldMask")?.split(",").includes("photos"));
      assert.ok(!calls[0].headers.get("X-Goog-FieldMask")?.split(",").includes("editorialSummary"));
      assert.equal(details.place.photos?.length, 1);
      assert.deepEqual(details.place.photo?.authors, [{ name: "Photographer 0", url: "https://maps.google.com/contrib/author0" }]);
    });

    await t.test("unavailable photos leave valid venue details usable without a broken hero", async () => {
      brokenMedia = true;
      const partial = await media.loadPlaceDetails("fixture");
      assert.equal(partial.place.photos?.length, 1);
      assert.equal(partial.place.photo?.url, "https://lh3.googleusercontent.com/photo5");
      brokenMedia = false; allMediaUnavailable = true;
      const unavailable = await media.loadPlaceDetails("fixture");
      assert.equal(unavailable.place.id, "fixture");
      assert.equal(unavailable.place.photo, undefined);
      assert.equal(unavailable.place.photos, undefined);
      allMediaUnavailable = false;
    });

    await t.test("discovery hydrates only its one chosen venue and exposes Google's exact description", async () => {
      calls.length = 0;
      const result = await media.discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
      assert.equal(result.places.length, 1);
      assert.equal(result.places[0].id, "fixture");
      assert.equal(result.places[0].photos?.length, 6);
      assert.deepEqual(result.places[0].photo, result.places[0].photos?.[0]);
      assert.equal(result.places[0].details?.description, description);
      assert.equal(result.places[0].details?.instagram, "https://www.instagram.com/fixture.gallery/");
      assert.equal(result.places[0].details?.rating, 4.6);
      assert.equal(calls.length, 7);
      assert.ok(calls.every(({ url }) => !url.pathname.includes("unchosen")));
    });

    await t.test("an ordinary Google website never becomes a guessed Instagram profile", async () => {
      officialWebsite = "https://fixture.example/";
      const result = await media.discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
      assert.equal(result.places[0].details?.instagram, undefined);
      assert.equal(result.places[0].details?.website, officialWebsite);
      officialWebsite = undefined;
      const withoutWebsite = await media.discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
      assert.equal(withoutWebsite.places[0].details?.instagram, undefined);
      officialWebsite = "https://www.instagram.com/fixture.gallery/?hl=en";
    });

    await t.test("failed final rating checks remain closed and do not request any media", async () => {
      calls.length = 0; rating = 3.75;
      const result = await media.discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
      assert.deepEqual(result.places, []);
      assert.deepEqual(result.searchIssues, ["google-rating"]);
      assert.equal(mediaCalls().length, 0);
      rating = 4.6;
    });

    await t.test("legacy candidate lists keep one hero each while a single selection gets a gallery", async () => {
      const records = placesResponseSchema.parse({ places: [record("fixture", rating), record("unchosen", rating)] }).places;
      calls.length = 0;
      const list = await media.attachPlacePhotos(candidates, records);
      assert.equal(mediaCalls().length, 2);
      assert.ok(list.places.every((place) => place.photo && !place.photos));
      calls.length = 0;
      const selected = await media.attachPlacePhotos({ ...candidates, places: [candidate] }, records);
      assert.equal(mediaCalls().length, 6);
      assert.equal(selected.places[0].photos?.length, 6);
    });

    await t.test("old hero-only payloads remain valid and gallery payloads cannot exceed six photos", () => {
      const photo = { url: "https://lh3.googleusercontent.com/fixture", authors: [{ name: "Photographer" }] };
      assert.equal(nearbyPlaceSchema.parse({ ...candidate, photo }).photos, undefined);
      assert.equal(invitationPlaceSchema.parse({ ...candidate, photo }).photo?.url, photo.url);
      assert.equal(nearbyPlaceSchema.safeParse({ ...candidate, photos: Array(7).fill(photo) }).success, false);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
