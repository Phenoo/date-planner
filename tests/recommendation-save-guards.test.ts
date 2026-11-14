import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Timestamp } from "firebase-admin/firestore";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { requestSchema, type Experience, type PlanRequest } from "../lib/planner/schema";
import { recalculateExactPlan } from "../lib/planner/engine";
import { toRecipe, type SavedRecipe } from "../lib/planner/saved";
import { fallbackDateStory } from "../lib/planner/date-story";
import { datePreferencesSchema } from "../lib/planner/invitations";
import { decodeRecipe } from "../lib/planner/money";
import { nextSaturday } from "../lib/utils";

type FixtureState = {
  rating: number | undefined;
  records: Map<string, unknown>;
  catalog: Experience[];
  catalogQualifies: boolean;
  detailCalls: number;
  qualityChecks: number;
  writes: number;
  transactions: number;
};
type GuardHarness = {
  state: FixtureState;
  createChosenDate: (request: Request, session: string, place: string, publish?: boolean) => Promise<{ token: string }>;
  createCatalogInvitation: (request: Request, recipe: SavedRecipe) => Promise<unknown>;
  dateSelectionId: (session: string, place: string) => string;
  hydrateDate: (record: unknown, withPhoto?: boolean) => Promise<{ place: { id: string } | null }>;
  manageDate: (request: Request, input: { action: "update" | "publish"; id: string; request?: PlanRequest }) => Promise<unknown>;
  savePlan: (request: Request) => Promise<Response>;
};

test("saving and sharing revalidate Google quality without changing historical reads", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "save-guard-test-"));
  const services: Record<string, string> = {
    "server-only": "",
    "@/lib/firebase/server": 'export { authenticatedClient, getDatabase } from "guard-test-state";',
    "@/lib/maps/place-details": 'import { state } from "guard-test-state"; export async function loadPlaceDetails(id) { state.detailCalls++; return { operational: true, record: { rating: state.rating }, place: { id, name: "Fixture", category: "Park", address: "Fixture address", mapsUrl: "https://www.google.com/maps/", attributions: [] } }; }',
    "@/lib/planner/catalog": 'import { state } from "guard-test-state"; export async function getCatalog() { return state.catalog; }',
    "@/lib/maps/google": 'export async function planningOrigin() { return { lat: 6.45, lng: 3.46 }; }',
    "@/lib/maps/resolve-time-zone": 'export async function resolvePlanningTimeZone(request) { return request; }',
    "@/lib/server/plan-ratings": 'import { state } from "guard-test-state"; export async function planHasQualifyingGoogleRatings() { state.qualityChecks++; return state.catalogQualifies; }',
    "@/lib/server/funnel": "export async function recordFunnel() {}",
    "./venue-controls": "export async function venueControls() { return new Set(); }",
    "./account-privacy": "export const deletionKey = (value) => value;",
  };
  services["./plan-ratings"] = services["@/lib/server/plan-ratings"];
  services["./funnel"] = services["@/lib/server/funnel"];
  services["guard-test-state"] = `
    export const state = { rating: 4.5, records: new Map(), catalog: [], catalogQualifies: true, detailCalls: 0, qualityChecks: 0, writes: 0, transactions: 0 };
    function ref(path) { return { path, collection(name) { return collection(path + "/" + name); }, async get() { return { exists: state.records.has(path), data: () => state.records.get(path), updateTime: { isEqual: () => true } }; } }; }
    function collection(path) { return { doc(id) { return ref(path + "/" + id); } }; }
    const db = { collection, async runTransaction(callback) {
      state.transactions++;
      const pending = [];
      const result = await callback({
        async get(target) { if (pending.length) throw new Error("Transaction read after write"); return target.get(); },
        set(target, value) { pending.push({ target, value }); },
        create(target, value) { if (state.records.has(target.path)) throw new Error("Duplicate creation"); pending.push({ target, value }); },
      });
      for (const { target, value } of pending) { state.records.set(target.path, value); state.writes++; }
      return result;
    } };
    export const getDatabase = () => db;
    export const authenticatedClient = async () => ({ db, user: { uid: "test-owner", firebase: { sign_in_provider: "password" } } });
  `;
  try {
    const output = join(directory, "guards.mjs");
    await build({
      stdin: { contents: 'export { createChosenDate, createCatalogInvitation, dateSelectionId, hydrateDate } from "./lib/server/date-invitations"; export { manageDate } from "./lib/server/date-management"; export { POST as savePlan } from "./app/api/saved-plans/route"; export { state } from "guard-test-state";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "guard-test-services", setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "guard-fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "guard-fixture" }, (args) => ({ contents: services[args.path], loader: "js" }));
      } }],
    });
    const harness: GuardHarness = await import(pathToFileURL(output).href);
    const { state } = harness;
    const template = demoCatalog.find((experience) => experience.category === "Food & dining");
    assert.ok(template);
    const experience = { ...template, id: "catalog-fixture", demo: false, sourceUrl: "https://example.test/venue", verifiedAt: "2026-11-01", placeId: "google-fixture" };
    const preferences = requestSchema.parse({ city: experience.city, area: experience.area, country: experience.country, currency: experience.currency, occasion: "Romantic date", budget: 1000000, vibes: ["Romantic"], date: nextSaturday(), startTime: "18:00", duration: 300 });
    const plan = recalculateExactPlan(preferences, [experience], undefined, [experience]);
    assert.ok(plan, "The trusted catalog fixture must form a valid plan before quality checks");
    const recipe = toRecipe(plan);
    const sessionId = "test-session";
    const placeId = "google-fixture";
    const selection = harness.dateSelectionId(sessionId, placeId);
    const historyPath = `users/test-owner/dateHistory/${selection}`;
    const story = fallbackDateStory("Park");
    const record = { ...datePreferencesSchema.parse(preferences), token: "a".repeat(32), invitationKey: "b".repeat(64), placeId, story, response: "pending", dateStatus: "planned", createdAt: Timestamp.now(), invitationRevoked: false, invitationPublished: true, source: "google", planningRequest: preferences };
    function reset() {
      state.records.clear(); state.rating = 4.5; state.catalog = [experience]; state.catalogQualifies = true;
      state.detailCalls = 0; state.qualityChecks = 0; state.writes = 0; state.transactions = 0;
      state.records.set(`users/test-owner/discoverySessions/${sessionId}`, { ...datePreferencesSchema.parse(preferences), candidates: [{ id: placeId, distanceKm: 1, story }], createdAt: Timestamp.now() });
    }
    const request = (body: unknown = {}) => new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) });

    await t.test("legacy discovery sessions cannot save or share a low or missing rating", async () => {
      for (const rating of [undefined, 3.5, 3.75]) {
        for (const publish of [false, true]) {
          reset(); state.rating = rating;
          await assert.rejects(harness.createChosenDate(request(), sessionId, placeId, publish), { status: 409 });
          assert.equal(state.detailCalls, 1); assert.equal(state.writes, 0); assert.equal(state.transactions, 0);
        }
      }
    });
    await t.test("existing selection shortcuts still require fresh qualifying provider ratings", async () => {
      for (const publish of [false, true]) {
        reset(); state.records.set(historyPath, record); state.rating = 3.75;
        await assert.rejects(harness.createChosenDate(request(), sessionId, placeId, publish), { status: 409 });
        assert.equal(state.records.get(historyPath), record);
        state.rating = 4;
        assert.equal((await harness.createChosenDate(request(), sessionId, placeId, publish)).token, record.token);
        assert.equal(state.detailCalls, 2); assert.equal(state.writes, 0);
      }
    });
    await t.test("catalog sharing checks trusted plan quality before creating an invitation", async () => {
      reset(); state.catalogQualifies = false;
      await assert.rejects(harness.createCatalogInvitation(request(), recipe), { status: 409 });
      assert.equal(state.qualityChecks, 1); assert.equal(state.writes, 0); assert.equal(state.transactions, 0);
    });
    await t.test("updating and publishing cannot reuse a downgraded Google or catalog venue", async () => {
      for (const source of ["google", "catalog"]) {
        for (const action of ["update", "publish"] as const) {
          reset(); state.rating = 3.75; state.catalogQualifies = false;
          const stored = { ...record, source, placeId: source === "catalog" ? experience.id : placeId };
          state.records.set(historyPath, stored);
          const input = action === "update" ? { action, id: selection, request: preferences } : { action, id: selection };
          await assert.rejects(harness.manageDate(request(), input), { status: 409 });
          assert.equal(state.records.get(historyPath), stored); assert.equal(state.writes, 0); assert.equal(state.transactions, 0);
          assert.equal(source === "catalog" ? state.qualityChecks : state.detailCalls, 1);
        }
      }
    });
    await t.test("saved recipe metadata and demo flags cannot bypass trusted catalog quality", async () => {
      reset();
      assert.equal((await harness.savePlan(request({ ...recipe, experienceIds: ["unknown"], demo: true }))).status, 409);
      assert.equal(state.qualityChecks, 0); assert.equal(state.writes, 0); assert.equal(state.transactions, 0);
      state.catalogQualifies = false;
      assert.equal((await harness.savePlan(request({ ...recipe, demo: true }))).status, 409);
      assert.equal(state.qualityChecks, 1); assert.equal(state.writes, 0); assert.equal(state.transactions, 0);
      state.catalogQualifies = true;
      const custom = { ...recipe, id: "existing-recipe-id", title: "My saved title" };
      assert.equal((await harness.savePlan(request(custom))).status, 200);
      const saved = [...state.records.entries()].find(([path]) => path.includes("/savedPlans/"));
      assert.ok(saved);
      const savedRecord = saved[1];
      assert.ok(savedRecord && typeof savedRecord === "object" && "recipe" in savedRecord);
      const savedRecipe = decodeRecipe(savedRecord.recipe);
      assert.ok(savedRecipe.success);
      assert.equal(savedRecipe.data.id, custom.id); assert.equal(savedRecipe.data.title, custom.title);
    });
    await t.test("read-only history hydration preserves an existing venue even after a rating drop", async () => {
      reset(); state.rating = 3.5;
      assert.equal((await harness.hydrateDate(record, false)).place?.id, placeId);
      assert.equal(state.writes, 0);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
