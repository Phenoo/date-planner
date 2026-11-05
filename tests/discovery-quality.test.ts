import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { requestSchema } from "../lib/planner/schema";

type Scenario = { rating?: number; lookupFailure?: boolean };
type DiscoveryHarness = Pick<typeof import("../lib/server/date-discovery"), "discoverDatePlaces"> & {
  setScenario: (scenario: Scenario) => void;
};

const mockProvider = `
let scenario = { rating: 4.2 };
export function setScenario(next) { scenario = next; }
export async function createDiscoveryBrief() { return null; }
export async function rankDiscoveredPlaces(result) { return result; }
export async function attachPlacePhotos(result) { return result; }
export async function loadPlaceCandidates() {
  return {
    records: [],
    result: {
      area: "Lekki", city: "Lagos", country: "Nigeria",
      places: [{
        id: "fixture", name: "Fixture gallery", address: "Fixture", category: "Gallery",
        distanceKm: 1, reason: "Fixture", mapsUrl: "https://www.google.com/maps/", attributions: [],
        details: { checkedAt: "2020-01-01T00:00:00Z", opening: "unknown", hours: [], rating: 4.9, reviewCount: 100, travelMinutes: 5, reviews: [] }
      }]
    }
  };
}
export async function loadPlaceDetails(id) {
  if (scenario.lookupFailure) throw new Error("Fixture detail lookup unavailable");
  return {
    operational: true,
    record: { rating: scenario.rating, userRatingCount: 120, reviews: [] },
    place: { id, name: "Fixture gallery", address: "Fixture", category: "Gallery", mapsUrl: "https://www.google.com/maps/", attributions: [] }
  };
}
`;

test("discovery rechecks the actual Google rating and never falls back to stale candidate facts", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "discovery-quality-test-"));
  try {
    const output = join(directory, "discovery.mjs");
    await build({
      stdin: {
        contents: 'export { discoverDatePlaces } from "./lib/server/date-discovery"; export { setScenario } from "discovery-quality-mock";',
        resolveDir: process.cwd(),
      },
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      logLevel: "silent",
      plugins: [{
        name: "isolated-discovery-providers",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:server-only|@\/lib\/planner\/discovery-ai|@\/lib\/maps\/places|@\/lib\/maps\/place-details|discovery-quality-mock)$/ }, () => ({ path: "discovery-quality-mock", namespace: "discovery-quality" }));
          plugin.onLoad({ filter: /.*/, namespace: "discovery-quality" }, () => ({ contents: mockProvider, loader: "js" }));
        },
      }],
    });
    const { discoverDatePlaces, setScenario }: DiscoveryHarness = await import(pathToFileURL(output).href);
    const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Casual date", budget: null, vibes: ["Relaxed"], date: "2030-11-02", startTime: "14:00", durationMode: "estimated" });

    for (const rating of [3.75, 3.7, undefined]) {
      await t.test(`withholds the candidate when the fresh Google average is ${String(rating)}`, async () => {
        setScenario({ rating });
        const result = await discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
        assert.deepEqual(result.places, []);
        assert.deepEqual(result.searchIssues, ["google-rating"]);
      });
    }

    await t.test("a failed detail lookup cannot return the old 4.9-star candidate", async () => {
      setScenario({ lookupFailure: true });
      const result = await discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
      assert.deepEqual(result.places, []);
      assert.deepEqual(result.searchIssues, ["venue-changed"]);
    });

    await t.test("a valid final Google average is returned instead of the stale search rating", async () => {
      setScenario({ rating: 4.2 });
      const result = await discoverDatePlaces(request, { lat: 6.45, lng: 3.46 });
      assert.equal(result.places.length, 1);
      assert.equal(result.places[0].id, "fixture");
      assert.equal(result.places[0].details?.rating, 4.2);
      assert.equal(result.places[0].details?.reviewCount, 120);
      assert.notEqual(result.places[0].details?.checkedAt, "2020-01-01T00:00:00Z");
      assert.equal(result.searchIssues, undefined);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
