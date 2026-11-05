import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Timestamp } from "firebase-admin/firestore";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { requestSchema, type Experience } from "../lib/planner/schema";
import { recalculateExactPlan } from "../lib/planner/engine";
import { toRecipe } from "../lib/planner/saved";
import { encodeRecipe } from "../lib/planner/money";
import { savedDocumentId } from "../lib/firebase/paths";
import { nextSaturday } from "../lib/utils";

type FixtureState = {
  records: Map<string, Record<string, unknown>>;
  user: { email?: string; emailVerified: boolean; disabled: boolean };
  userMissing: boolean;
  catalog: Experience[];
  detailCalls: number;
  photoFlags: boolean[];
  beforeDetails: (() => void) | null;
  beforeAuth: (() => void) | null;
  afterClaim: (() => void) | null;
  failNextCommit: boolean;
};
type Harness = {
  state: FixtureState;
  put: (path: string, record: Record<string, unknown>) => void;
  queue: (owner: string, id: string, source: "google" | "catalog", recipeId?: string) => Promise<void>;
  sendDateCreatedEmail: (owner: string, id: string) => Promise<void>;
};

test("date-created email outbox preserves saves, privacy and provider idempotency", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "date-email-test-"));
  const services: Record<string, string> = {
    "server-only": "",
    "@/lib/firebase/server": 'export { getDatabase } from "date-email-fixture"; export const getFirebaseAdmin = () => ({});',
    "firebase-admin/auth": 'import { state } from "date-email-fixture"; export const getAuth = () => ({ async getUser() { state.beforeAuth?.(); if (state.userMissing) throw Object.assign(new Error("Missing fixture user"), { code: "auth/user-not-found" }); return { ...state.user }; } });',
    "@/lib/maps/place-details": 'import { state } from "date-email-fixture"; export async function loadPlaceDetails(_id, withPhoto) { state.detailCalls++; state.photoFlags.push(withPhoto); state.beforeDetails?.(); return { place: { name: "Secret Garden", address: "12 Quiet Road, Lekki, Lagos", category: "Park" }, operational: true, record: { rating: 4.7 } }; }',
    "@/lib/planner/catalog": 'import { state } from "date-email-fixture"; export async function getCatalog() { return state.catalog; }',
    "./account-privacy": 'import { createHash } from "node:crypto"; export const deletionKey = uid => createHash("sha256").update(uid).digest("hex");',
    "date-email-fixture": `
      import { FieldValue, Timestamp } from "firebase-admin/firestore";
      export const state = { records: new Map(), versions: new Map(), user: { email: "owner@example.test", emailVerified: true, disabled: false }, userMissing: false, catalog: [], detailCalls: 0, photoFlags: [], beforeDetails: null, beforeAuth: null, afterClaim: null, failNextCommit: false };
      let revision = 0;
      export function put(path, value) { state.records.set(path, value); state.versions.set(path, ++revision); }
      function snapshot(target) { const value = state.records.get(target.path); const time = state.versions.get(target.path) ?? 0; return { exists: state.records.has(target.path), data: () => value, ref: target, updateTime: Timestamp.fromMillis(time) }; }
      function ref(path) { return { path, id: path.split("/").at(-1), collection(name) { return collection(path + "/" + name); }, async get() { return snapshot(this); } }; }
      function collection(path) { return { doc(id) { return ref(path + "/" + id); } }; }
      let serial = Promise.resolve();
      const db = { collection, runTransaction(callback) {
        const operation = serial.then(async () => {
          const pending = [];
          const transaction = {
            async get(target) { if (pending.length) throw new Error("Transaction read after write"); return snapshot(target); },
            create(target, value) { pending.push({ kind: "create", target, value }); },
            update(target, value) { pending.push({ kind: "update", target, value }); },
          };
          const result = await callback(transaction);
          if (state.failNextCommit) { state.failNextCommit = false; throw new Error("Fixture commit interrupted"); }
          for (const { kind, target, value } of pending) {
            if (kind === "create" && state.records.has(target.path)) throw new Error("Duplicate fixture job");
            if (kind === "update" && !state.records.has(target.path)) throw new Error("Missing fixture job");
            const next = kind === "create" ? {} : { ...state.records.get(target.path) };
            for (const [key, field] of Object.entries(value)) {
              if (field instanceof FieldValue && field.isEqual(FieldValue.delete())) delete next[key];
              else next[key] = field;
            }
            put(target.path, next);
            if (value.status === "sending") state.afterClaim?.();
          }
          return result;
        });
        serial = operation.catch(() => {});
        return operation;
      } };
      export const getDatabase = () => db;
    `,
  };
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const requests: { key: string | null; body: string }[] = [];
  let respond: () => Promise<Response> = async () => Response.json({ id: "mail-fixture" });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails", "No real email or venue request may escape the fixture");
    requests.push({ key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body ?? "") });
    return respond();
  };
  process.env.RESEND_API_KEY = "test-only-no-outbound-key";
  try {
    const output = join(directory, "email.mjs");
    await build({
      stdin: { contents: 'export { sendDateCreatedEmail } from "./lib/server/date-created-email"; import { queueDateCreatedEmail } from "./lib/server/date-email-outbox"; import { getDatabase } from "date-email-fixture"; export { state, put } from "date-email-fixture"; export const queue = (owner,id,source,recipeId) => getDatabase().runTransaction(tx => queueDateCreatedEmail(tx,getDatabase().collection("users").doc(owner),{dateId:id,source,recipeId}));', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "date-email-services", setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "email-fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "email-fixture" }, args => ({ contents: services[args.path], loader: "js", resolveDir: process.cwd() }));
      } }],
    });
    const harness: Harness = await import(pathToFileURL(output).href);
    const { state } = harness;
    const owner = "fixture-owner";
    const dateId = "a".repeat(64);
    const userPath = `users/${owner}`;
    const jobPath = `${userPath}/emailNotifications/${dateId}`;
    const historyPath = `${userPath}/dateHistory/${dateId}`;
    const deletionPath = `accountDeletionRequests/${createHash("sha256").update(owner).digest("hex")}`;
    const source = {
      source: "google", placeId: "fixture-place", date: "2030-11-02", datePreference: "weekend", startTime: "18:00", timeZone: "Africa/Lagos", city: "Lagos", country: "Nigeria", duration: 180,
      token: "INVITATION_TOKEN_MUST_STAY_PRIVATE", invitationKey: "INVITATION_KEY_MUST_STAY_PRIVATE", message: "PRIVATE_MESSAGE", customTitle: "PRIVATE_TITLE", story: { introduction: "PRIVATE_STORY" },
      planningRequest: { notes: "PRIVATE_NOTES", interests: "PRIVATE_INTERESTS", budget: 91827364, dietary: ["PRIVATE_DIET"], accessibility: true, yourGender: "PRIVATE_GENDER" },
    };
    async function reset() {
      state.records.clear(); requests.length = 0;
      state.user = { email: "owner@example.test", emailVerified: true, disabled: false };
      state.userMissing = false; state.catalog = []; state.detailCalls = 0; state.photoFlags = []; state.beforeDetails = null; state.beforeAuth = null; state.afterClaim = null; state.failNextCommit = false;
      respond = async () => Response.json({ id: "mail-fixture" });
      harness.put(userPath, { updatedAt: Timestamp.now() });
      harness.put(historyPath, source);
      await harness.queue(owner, dateId, "google");
    }
    function job(path = jobPath) { const value = state.records.get(path); assert.ok(value); return value; }

    await t.test("queueing is metadata-only and preserves an existing durable marker", async () => {
      await reset();
      assert.deepEqual(Object.keys(job()).sort(), ["createdAt", "source", "status"]);
      assert.equal(requests.length, 0);
      harness.put(jobPath, { ...job(), status: "sent", emailId: "previous" });
      const marker = job();
      await harness.queue(owner, dateId, "google");
      assert.equal(job(), marker);
      const catalogId = "b".repeat(64);
      await harness.queue(owner, catalogId, "catalog", "");
      assert.equal(job(`${userPath}/emailNotifications/${catalogId}`).recipeId, "", "Legacy recipe IDs retain the existing saved-document lookup contract");
    });
    await t.test("verified owner gets one branded confirmation without private planning or invitation data", async () => {
      await reset(); await harness.sendDateCreatedEmail(owner, dateId);
      assert.equal(requests.length, 1); assert.equal(job().status, "sent");
      assert.equal(job().payload, undefined, "Frozen personal content is removed after delivery acknowledgement");
      assert.match(requests[0].body, /Secret Garden/); assert.match(requests[0].body, /6:00 PM/);
      assert.match(requests[0].body, /Venue details from Google Maps/);
      assert.match(requests[0].body, /Saturday/); assert.match(requests[0].body, /https:\/\/adateatlas\.com\/saved/);
      for (const privateValue of ["INVITATION_TOKEN", "INVITATION_KEY", "PRIVATE_MESSAGE", "PRIVATE_TITLE", "PRIVATE_STORY", "PRIVATE_NOTES", "PRIVATE_INTERESTS", "91827364", "PRIVATE_DIET", "PRIVATE_GENDER", "/invite/"]) assert.ok(!requests[0].body.includes(privateValue));
      assert.deepEqual(state.photoFlags, [false]);
      await harness.sendDateCreatedEmail(owner, dateId); await harness.queue(owner, dateId, "google"); await harness.sendDateCreatedEmail(owner, dateId);
      assert.equal(requests.length, 1, "Retry, publish and requeue cannot resend a completed notification");
    });
    await t.test("concurrent workers use one lease and only one provider request", async () => {
      await reset();
      let entered = () => {}; let release = () => {};
      const started = new Promise<void>(resolve => { entered = resolve; });
      const waiting = new Promise<void>(resolve => { release = resolve; });
      respond = async () => { entered(); await waiting; return Response.json({ id: "single-mail" }); };
      const first = harness.sendDateCreatedEmail(owner, dateId);
      await started;
      await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /already being processed/);
      assert.equal(requests.length, 1);
      release(); await first;
      assert.equal(job().status, "sent");
    });
    await t.test("unconfirmed delivery retries the frozen body and stable key after details change", async () => {
      await reset();
      respond = async () => { state.failNextCommit = true; return Response.json({ id: "accepted-before-database-interruption" }); };
      await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /will be retried/);
      assert.equal(job().status, "retry");
      const first = requests[0];
      harness.put(historyPath, { ...source, startTime: "22:00", customTitle: "ANOTHER_PRIVATE_TITLE" });
      respond = async () => Response.json({ id: "accepted-before-database-interruption" });
      await harness.sendDateCreatedEmail(owner, dateId);
      assert.deepEqual(requests[1], first);
      assert.equal(state.detailCalls, 1); assert.equal(job().status, "sent");
    });
    await t.test("an expired worker cannot overwrite the successor lease outcome", async () => {
      await reset();
      let entered = () => {}; let release = () => {}; let attempt = 0;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const waiting = new Promise<void>(resolve => { release = resolve; });
      respond = async () => {
        if (++attempt === 1) { entered(); await waiting; return Response.json({ id: "stale-worker-response" }); }
        return Response.json({ id: "successor-worker-response" });
      };
      const first = harness.sendDateCreatedEmail(owner, dateId);
      await started;
      harness.put(jobPath, { ...job(), leaseUntil: Timestamp.fromMillis(Date.now() - 1) });
      await harness.sendDateCreatedEmail(owner, dateId);
      assert.equal(job().emailId, "successor-worker-response");
      release(); await first;
      assert.equal(job().emailId, "successor-worker-response");
      assert.deepEqual(requests[1], requests[0], "Overlapping attempts retain the provider's idempotency protection");
    });
    await t.test("unverified accounts get a generic message and never upgrade its body during retry", async () => {
      await reset(); state.user.emailVerified = false;
      respond = async () => { throw new Error("Fixture network interruption"); };
      await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /will be retried/);
      assert.equal(job().personalized, false); assert.equal(state.detailCalls, 0);
      const first = requests[0];
      for (const privateValue of ["Secret Garden", "Quiet Road", "Lekki", "Lagos", "Nigeria", "2030", "Saturday", "6:00", "PRIVATE_", "/invite/"]) assert.ok(!first.body.includes(privateValue), privateValue);
      state.user.emailVerified = true; respond = async () => Response.json({ id: "generic-mail" });
      await harness.sendDateCreatedEmail(owner, dateId);
      assert.deepEqual(requests[1], first); assert.equal(state.detailCalls, 0);
    });
    await t.test("disabled, deleting, missing owner and missing source accounts cannot send", async () => {
      for (const unavailable of ["disabled", "deleting", "owner", "source", "auth", "email"]) {
        await reset();
        if (unavailable === "disabled") state.user.disabled = true;
        if (unavailable === "deleting") harness.put(deletionPath, { status: "processing" });
        if (unavailable === "owner") state.records.delete(userPath);
        if (unavailable === "source") state.records.delete(historyPath);
        if (unavailable === "auth") state.userMissing = true;
        if (unavailable === "email") state.user.email = undefined;
        await harness.sendDateCreatedEmail(owner, dateId);
        assert.equal(requests.length, 0, unavailable); assert.equal(job().status, "skipped");
      }
    });
    await t.test("deletion, recipient changes and verification downgrades during venue lookup are rechecked", async () => {
      for (const change of ["deletion", "recipient", "verification"]) {
        await reset();
        state.beforeDetails = () => {
          if (change === "deletion") harness.put(deletionPath, { status: "requested" });
          if (change === "recipient") state.user.email = "different@example.test";
          if (change === "verification") state.user.emailVerified = false;
        };
        await harness.sendDateCreatedEmail(owner, dateId);
        assert.equal(requests.length, 0, change); assert.equal(job().status, "skipped"); assert.equal(job().payload, undefined);
      }
    });
    await t.test("a frozen personal payload is never sent after its recipient or verification changes", async () => {
      for (const change of ["recipient", "verification"]) {
        await reset(); respond = async () => Response.json({ name: "server_error" }, { status: 503 });
        await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /will be retried/);
        if (change === "recipient") state.user.email = "different@example.test";
        else state.user.emailVerified = false;
        await harness.sendDateCreatedEmail(owner, dateId);
        assert.equal(requests.length, 1, change); assert.equal(job().status, "skipped"); assert.equal(job().payload, undefined);
      }
    });
    await t.test("ambiguous attempts stop before provider key expiry and permanent rejection does not loop", async () => {
      await reset(); respond = async () => Response.json({ name: "server_error" }, { status: 503 });
      await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /will be retried/);
      harness.put(jobPath, { ...job(), firstAttemptAt: Timestamp.fromMillis(Date.now() - 24 * 3600000) });
      await harness.sendDateCreatedEmail(owner, dateId);
      assert.equal(requests.length, 1); assert.equal(job().status, "needs-review"); assert.equal(job().payload, undefined);
      await reset(); respond = async () => Response.json({ name: "validation_error" }, { status: 422 });
      await harness.sendDateCreatedEmail(owner, dateId); await harness.sendDateCreatedEmail(owner, dateId);
      assert.equal(requests.length, 1); assert.equal(job().status, "failed");
    });
    await t.test("slow final auth reads cannot send after the retry window or lease expires", async () => {
      const realNow = Date.now;
      try {
        for (const expiry of ["window", "lease"]) {
          await reset(); respond = async () => Response.json({ name: "server_error" }, { status: 503 });
          await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /will be retried/);
          let now = realNow(); Date.now = () => now;
          if (expiry === "window") harness.put(jobPath, { ...job(), firstAttemptAt: Timestamp.fromMillis(now - (24 * 3600000 - 60000) + 1000) });
          let reads = 0;
          state.beforeAuth = () => { if (++reads === 2) now += expiry === "window" ? 2000 : 61000; };
          if (expiry === "window") {
            await harness.sendDateCreatedEmail(owner, dateId);
            assert.equal(job().status, "needs-review");
          } else {
            await assert.rejects(harness.sendDateCreatedEmail(owner, dateId), /will be retried/);
            assert.equal(job().status, "retry");
          }
          assert.equal(requests.length, 1, expiry);
          Date.now = realNow;
        }
      } finally { Date.now = realNow; }
    });
    await t.test("catalog aliases resolve trusted venue data and cannot email an overwritten different plan", async () => {
      await reset(); state.records.delete(historyPath);
      const template = demoCatalog.find(item => item.category === "Food & dining"); assert.ok(template);
      const experience = { ...template, id: "email-catalog-fixture", venue: "Trusted Catalog Venue", demo: false, verifiedAt: "2026-11-01", sourceUrl: "https://example.test/venue" };
      state.catalog = [experience];
      const preferences = requestSchema.parse({ city: experience.city, area: experience.area, country: experience.country, currency: experience.currency, occasion: "Romantic date", budget: 1000000, vibes: ["Romantic"], date: nextSaturday(), startTime: "18:00", duration: 300 });
      const plan = recalculateExactPlan(preferences, [experience], undefined, [experience]); assert.ok(plan);
      const id = createHash("sha256").update(`catalog:${plan.id}`).digest("hex");
      const alias = "my/custom/date-id";
      const recipe = { ...toRecipe(plan), id: alias, title: "PRIVATE_CUSTOM_TITLE" };
      const savedPath = `${userPath}/savedPlans/${savedDocumentId(alias)}`;
      const catalogJobPath = `${userPath}/emailNotifications/${id}`;
      harness.put(savedPath, { recipe: encodeRecipe(recipe) });
      await harness.queue(owner, id, "catalog", alias);
      await harness.sendDateCreatedEmail(owner, id);
      assert.equal(job(catalogJobPath).status, "sent"); assert.match(requests[0].body, /Trusted Catalog Venue/); assert.ok(!requests[0].body.includes("PRIVATE_CUSTOM_TITLE"));
      await reset(); state.records.delete(historyPath); state.catalog = [experience];
      harness.put(savedPath, { recipe: encodeRecipe({ ...recipe, request: { ...recipe.request, occasion: "Birthday" } }) });
      await harness.queue(owner, id, "catalog", alias);
      await harness.sendDateCreatedEmail(owner, id);
      assert.equal(requests.length, 0); assert.equal(job(catalogJobPath).status, "skipped");

      await reset(); state.records.delete(historyPath); state.catalog = [experience];
      harness.put(savedPath, { recipe: encodeRecipe(recipe) });
      await harness.queue(owner, id, "catalog", alias);
      respond = async () => Response.json({ name: "server_error" }, { status: 503 });
      await assert.rejects(harness.sendDateCreatedEmail(owner, id), /will be retried/);
      state.afterClaim = () => harness.put(savedPath, { recipe: encodeRecipe({ ...recipe, request: { ...recipe.request, occasion: "Birthday" } }) });
      await assert.rejects(harness.sendDateCreatedEmail(owner, id), /will be retried/);
      assert.equal(requests.length, 1, "An alias overwritten after claiming cannot send the frozen original plan");
      state.afterClaim = null;
      await harness.sendDateCreatedEmail(owner, id);
      assert.equal(job(catalogJobPath).status, "skipped");
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousKey;
    await rm(directory, { recursive: true, force: true });
  }
});
