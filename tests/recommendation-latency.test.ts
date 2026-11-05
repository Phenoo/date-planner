import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { requestSchema, type PlanRequest } from "../lib/planner/schema";

type State = {
  events: string[];
  catalog: unknown[];
  catalogPlan: boolean;
  briefQueries: string[];
  blocked: string[];
  briefWait?: Promise<void>;
  controlsWait?: Promise<void>;
  persistWait?: Promise<void>;
  onPersistStart?: () => void;
  lastOrigin?: { lat: number; lng: number };
  lastCatalog?: unknown[];
};
type Harness = Pick<typeof import("../lib/server/actions/generate"), "generate">
  & Pick<typeof import("../lib/server/date-discovery"), "discoverDatePlaces">
  & Pick<typeof import("../lib/maps/places"), "loadPlaceCandidates">
  & { state: State };

function gate() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const provider = (id = "fixture", rating: number | undefined = 4.6) => ({
  id, displayName: { text: `Venue ${id}` }, formattedAddress: "Lekki, Lagos, Nigeria", primaryTypeDisplayName: { text: "Gallery" },
  types: ["art_gallery"], businessStatus: "OPERATIONAL", rating, userRatingCount: 150,
  location: { latitude: 6.45, longitude: 3.46 }, timeZone: { id: "Africa/Lagos" },
});
const preferences = requestSchema.parse({ city: "Lagos", area: "Lekki", country: "Nigeria", occasion: "Romantic date", budget: null, vibes: ["Romantic"], durationMode: "estimated", date: "2030-11-02", startTime: "14:00" });

test("recommendation preparation removes duplicate location work and overlaps independent providers", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "recommendation-latency-test-"));
  const originalKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-maps-key";
  const services: Record<string, string> = {
    "server-only": "",
    "latency-test-state": `
      export const state = { events: [], catalog: [], catalogPlan: false, briefQueries: ["pottery studios", "ceramic galleries"], blocked: [] };
      export async function getCatalog() { state.events.push("catalog"); return state.catalog; }
      export function generateSinglePlan(input, catalog, unused, origin) {
        state.events.push("catalog-plan"); state.lastOrigin = origin; state.lastCatalog = catalog;
        return { plans: state.catalogPlan ? [{ id: "catalog-date", request: input.request, activities: [] }] : [], warnings: [], rejected: [] };
      }
      export async function personalize(result) { state.events.push("personalize"); return result; }
      export async function createDiscoveryBrief() { state.events.push("brief-start"); await state.briefWait; state.events.push("brief-end"); return { queries: state.briefQueries }; }
      export async function rankDiscoveredPlaces(result) { state.events.push("rank"); return { ...result, ai: true, places: result.places.slice(0, 1) }; }
      export async function venueControls() { state.events.push("controls-start"); await state.controlsWait; state.events.push("controls-end"); return new Set(state.blocked); }
      export async function persistDiscoverySession(request, result, preferences) { state.events.push("persist-start"); state.onPersistStart?.(); await state.persistWait; state.events.push("persist-end"); return { ...result, sessionId: "00000000-0000-4000-8000-000000000001" }; }
      export async function persistPlans(request, plans) { state.events.push("persist-plans:" + plans.length); }
      export async function coordinateGeneration(request, input, run) { return Response.json(await run(request.signal)); }
      export async function enforcePlannerLimit() {}
      export async function planHasQualifyingGoogleRatings() { state.events.push("catalog-rating"); return true; }
    `,
  };
  for (const path of ["@/lib/planner/catalog", "@/lib/planner/engine", "@/lib/planner/ai", "@/lib/planner/discovery-ai", "@/lib/server/venue-controls", "@/lib/server/date-invitations", "@/lib/server/plan-persistence", "@/lib/server/generation-coordinator", "@/lib/planner/rate-limit", "@/lib/server/plan-ratings"]) services[path] = 'export * from "latency-test-state";';
  try {
    const output = join(directory, "latency.mjs");
    await build({
      stdin: { contents: 'export { generate } from "./lib/server/actions/generate"; export { discoverDatePlaces } from "./lib/server/date-discovery"; export { loadPlaceCandidates } from "./lib/maps/places"; export { state } from "latency-test-state";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "isolated-latency-providers", setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "latency-fixture" } : undefined);
        plugin.onLoad({ filter: /.*/, namespace: "latency-fixture" }, (args) => ({ contents: services[args.path], loader: "js" }));
      } }],
    });
    const harness: Harness = await import(pathToFileURL(output).href);
    const { state } = harness;
    let geocodeWait: Promise<void> | undefined;
    let geocodeFails = false;
    let records: (Omit<ReturnType<typeof provider>, "rating"> & { rating?: number })[] = [provider()];
    const searches: { url: URL; body: Record<string, unknown> }[] = [];
    const geocodes: URL[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input));
      if (url.hostname === "maps.googleapis.com") {
        geocodes.push(url); state.events.push("geocode-start"); await geocodeWait; state.events.push("geocode-end");
        if (geocodeFails) throw new Error("Fixture geocoding unavailable");
        return Response.json({ status: "OK", results: [{ address_components: [], geometry: { location: { lat: 6.45, lng: 3.46 } } }] });
      }
      assert.equal(url.origin, "https://places.googleapis.com");
      if (url.pathname.includes(":search")) {
        state.events.push("search"); searches.push({ url, body: JSON.parse(String(init.body)) });
        return Response.json({ places: records });
      }
      state.events.push("final-details");
      return Response.json(records.find((record) => record.id === url.pathname.split("/").at(-1)));
    });
    const reset = () => {
      state.events.length = 0; state.catalog = []; state.catalogPlan = false; state.blocked = [];
      state.briefWait = undefined; state.controlsWait = undefined; state.persistWait = undefined; state.onPersistStart = undefined; state.lastOrigin = undefined; state.lastCatalog = undefined;
      geocodeWait = undefined; geocodeFails = false; searches.length = 0; geocodes.length = 0; records = [provider()];
    };
    const generate = (request: PlanRequest) => harness.generate(new Request("https://adateatlas.com/api/generate", { method: "POST", body: JSON.stringify({ request }) }));

    await t.test("empty-catalog default planning uses one destination geocode and no pre-search AI brief", async () => {
      reset();
      const request = { ...preferences, locationScope: "city" as const, startingArea: "An unrelated starting point" };
      const response = await generate(request);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(geocodes.length, 1);
      assert.equal(geocodes[0].searchParams.get("address"), "Lagos, Nigeria");
      assert.equal(state.events.includes("brief-start"), false);
      assert.equal(state.events.filter((event) => event === "rank").length, 1);
      assert.equal(result.nearby.places[0].details.rating, 4.6);
      assert.equal(result.nearby.sessionId, "00000000-0000-4000-8000-000000000001");
      assert.ok(state.events.indexOf("rank") < state.events.indexOf("final-details"));
      assert.ok(state.events.indexOf("final-details") < state.events.indexOf("persist-start"));
      assert.equal(state.lastOrigin, undefined);
    });

    await t.test("foreign-city-only catalog keeps all rejection records but uses one discovery geocode", async () => {
      reset();
      state.catalog = [{ id: "london", city: "London", country: "United Kingdom" }, { id: "same-city-foreign-country", city: "Lagos", country: "Portugal" }];
      const response = await generate({ ...preferences, locationScope: "city", startingArea: "An unrelated starting point" });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.nearby.places[0].id, "fixture");
      assert.equal(geocodes.length, 1);
      assert.equal(geocodes[0].searchParams.get("address"), "Lagos, Nigeria");
      assert.equal(state.lastOrigin, undefined);
      assert.deepEqual(state.lastCatalog, state.catalog, "The engine must retain the complete catalog for its existing rejection diagnostics");
    });

    await t.test("custom interests retain AI queries while brief, geocode and controls start together", async () => {
      reset();
      const brief = gate(), location = gate(), controls = gate();
      state.briefWait = brief.promise; geocodeWait = location.promise; state.controlsWait = controls.promise;
      const pending = harness.discoverDatePlaces({ ...preferences, interests: "Pottery and ceramics" }, undefined);
      assert.deepEqual(state.events, ["brief-start", "controls-start", "geocode-start"]);
      assert.equal(searches.length, 0);
      brief.release(); await Promise.resolve();
      assert.equal(searches.length, 0, "Neither unfinished location nor disabled-venue checks may be bypassed");
      location.release(); controls.release();
      const result = await pending;
      assert.equal(result.places[0].id, "fixture");
      const text = searches.filter(({ url }) => url.pathname.endsWith(":searchText"));
      assert.equal(text.length, 2);
      assert.equal(text[0].body.textQuery, "pottery studios in Lekki, Lagos, Nigeria");
      assert.equal(text[1].body.textQuery, "ceramic galleries in Lekki, Lagos, Nigeria");
      assert.equal(geocodes.length, 1);
    });

    await t.test("special instructions and liked categories retain their existing query brief", async () => {
      for (const variant of [{ request: { ...preferences, notes: "A quiet astronomy experience" }, options: {} }, { request: preferences, options: { likedPlaceCategories: ["Planetarium"] } }]) {
        reset();
        await harness.discoverDatePlaces(variant.request, undefined, variant.options);
        assert.equal(state.events.filter((event) => event === "brief-start").length, 1);
        assert.equal(searches.filter(({ url }) => url.pathname.endsWith(":searchText")).length, 2);
      }
    });

    await t.test("catalog plans retain their origin, quality check and persistence", async () => {
      reset(); state.catalog = [{ id: "local", city: "lAGos", country: "nIgErIa" }]; state.catalogPlan = true;
      const response = await generate(preferences);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).plans[0].id, "catalog-date");
      assert.deepEqual(state.lastOrigin, { lat: 6.45, lng: 3.46 });
      assert.equal(geocodes.length, 1);
      assert.equal(searches.length, 0);
      assert.ok(state.events.includes("catalog-rating"));
      assert.ok(state.events.includes("persist-plans:1"));
      assert.deepEqual(state.lastCatalog, state.catalog);
    });

    await t.test("a local catalog origin failure keeps the existing fallback and does not launch discovery", async () => {
      reset(); state.catalog = [{ id: "local", city: "Lagos", country: "Nigeria" }]; geocodeFails = true;
      const response = await generate(preferences);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.nearby, undefined);
      assert.equal(state.lastOrigin, undefined);
      assert.equal(geocodes.length, 1);
      assert.equal(searches.length, 0);
      assert.ok(result.warnings.some((warning: string) => warning.includes("Catalog location estimates were used")));
    });

    await t.test("parallel preparation still excludes disabled and low-rated candidates before ranking", async () => {
      reset(); state.blocked = ["blocked"]; records = [provider("blocked"), provider("low", 3.75), { ...provider("unrated"), rating: undefined }];
      const result = await harness.discoverDatePlaces(preferences, undefined);
      assert.deepEqual(result.places, []);
      assert.deepEqual(result.searchIssues, ["google-rating"]);
      assert.equal(state.events.includes("final-details"), false);
    });

    await t.test("generation never resolves before its recoverable discovery context is persisted", async () => {
      reset(); const persist = gate(), started = gate(); state.persistWait = persist.promise; state.onPersistStart = started.release;
      let settled = false;
      const pending = generate(preferences).then((response) => { settled = true; return response; });
      await Promise.race([started.promise, pending.then(() => assert.fail("Generation ended before persisting its context"))]);
      assert.equal(settled, false);
      persist.release();
      assert.equal((await pending).status, 200);
      assert.ok(state.events.includes("persist-end"));
    });

    await t.test("cancellation during parallel preparation cannot launch paid searches", async () => {
      reset(); const brief = gate(); state.briefWait = brief.promise;
      const controller = new AbortController();
      const pending = harness.discoverDatePlaces({ ...preferences, interests: "Pottery" }, undefined, { signal: controller.signal });
      controller.abort(); brief.release();
      await assert.rejects(pending, { name: "AbortError" });
      assert.equal(searches.length, 0);
      reset();
      await assert.rejects(harness.discoverDatePlaces(preferences, undefined, { signal: controller.signal }), { name: "AbortError" });
      assert.deepEqual(state.events, []);
    });
  } finally {
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY;
    else process.env.GOOGLE_MAPS_SERVER_KEY = originalKey;
    await rm(directory, { recursive: true, force: true });
  }
});

test("an empty approved catalog needs no venue-control read, while populated catalogs still enforce controls", async () => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "catalog-latency-test-"));
  const originalMode = process.env.DATE_ATLAS_CATALOG_MODE;
  delete process.env.DATE_ATLAS_CATALOG_MODE;
  const services: Record<string, string> = {
    "catalog-latency-state": `
      export const state = { records: [], catalogReads: 0, controlReads: 0 };
      const query = { where() { return query; }, limit() { return query; }, async get() { state.catalogReads++; return { docs: state.records.map(record => ({ data: () => ({ record }) })) }; } };
      export function getDatabase() { return { collection() { return query; } }; }
      export async function venueControls() { state.controlReads++; return new Set(["blocked"]); }
      export const decodeExperience = (data) => ({ success: true, data });
      export const catalogReviewIssues = () => [];
      export const demoCatalog = [];
    `,
  };
  for (const path of ["@/lib/firebase/server", "@/lib/server/venue-controls", "./money", "./catalog-review", "./demo-catalog"]) services[path] = 'export * from "catalog-latency-state";';
  try {
    const output = join(directory, "catalog.mjs");
    await build({
      stdin: { contents: 'export { getCatalog } from "./lib/planner/catalog"; export { state } from "catalog-latency-state";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "isolated-catalog-latency", setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "catalog-fixture" } : undefined);
        plugin.onLoad({ filter: /.*/, namespace: "catalog-fixture" }, (args) => ({ contents: services[args.path], loader: "js" }));
      } }],
    });
    const harness: { getCatalog: typeof import("../lib/planner/catalog").getCatalog; state: { records: unknown[]; catalogReads: number; controlReads: number } } = await import(pathToFileURL(output).href);
    assert.deepEqual(await harness.getCatalog(), []);
    assert.equal(harness.state.catalogReads, 1);
    assert.equal(harness.state.controlReads, 0);
    const fixture = { active: true, approved: true, demo: false, sourceUrl: "https://example.test/venue", verifiedAt: "2026-11-05" };
    harness.state.records = [{ ...fixture, id: "blocked" }, { ...fixture, id: "eligible" }];
    assert.deepEqual((await harness.getCatalog()).map((place) => place.id), ["eligible"]);
    assert.equal(harness.state.catalogReads, 2);
    assert.equal(harness.state.controlReads, 1);
  } finally {
    if (originalMode === undefined) delete process.env.DATE_ATLAS_CATALOG_MODE;
    else process.env.DATE_ATLAS_CATALOG_MODE = originalMode;
    await rm(directory, { recursive: true, force: true });
  }
});
