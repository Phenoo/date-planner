import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

type FixtureState = {
  events: string[];
  readyWait?: Promise<void>;
  signInWait?: Promise<void>;
  tokenWait?: Promise<void>;
  onEvent?: (event: string) => void;
};
type Harness = Pick<typeof import("../lib/firebase/planner-client"), "planningToken" | "plannerFetch">
  & Pick<typeof import("../lib/firebase/client"), "authenticateAccount" | "ensurePlanningIdentity">
  & { state: FixtureState; setUser: (anonymous: boolean | null) => void };

function deferred() {
  let resolve: () => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("planner identity preflight honors cancellation without changing Firebase account or guest coordination", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "planner-client-abort-test-"));
  const environmentNames = ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID", "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL"] as const;
  const environment = new Map(environmentNames.map((name) => [name, process.env[name]]));
  for (const name of environmentNames) process.env[name] = name === "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL" ? "" : "fixture-only";
  try {
    const output = join(directory, "planner-client.mjs");
    const sdkFixture = `
      export const state = { events: [], readyWait: undefined, signInWait: undefined, tokenWait: undefined, onEvent: undefined, user: null };
      function emit(event) { state.events.push(event); state.onEvent?.(event); }
      function user(anonymous) { return { uid: anonymous ? "fixture-guest" : "fixture-owner", isAnonymous: anonymous, async getIdToken() { emit("token"); await state.tokenWait; return "fixture-user-token"; } }; }
      export function setUser(anonymous) { state.user = anonymous === null ? null : user(anonymous); }
      const auth = { get currentUser() { return state.user; }, async authStateReady() { emit("ready"); await state.readyWait; } };
      export class FirebaseError extends Error { constructor(code, message) { super(message); this.code = code; } }
      export function getApps() { return [{ name: "date-atlas" }]; }
      export function initializeApp() { throw new Error("Unexpected fixture app initialization"); }
      export function getAuth() { return auth; }
      export function connectAuthEmulator() { throw new Error("Unexpected fixture emulator connection"); }
      export function isSignInWithEmailLink() { return false; }
      export function signInWithEmailLink() { throw new Error("Unexpected fixture email sign-in"); }
      export async function signInAnonymously() { emit("guest-sign-in"); await state.signInWait; setUser(true); }
    `;
    await build({
      stdin: { contents: 'export { planningToken, plannerFetch } from "./lib/firebase/planner-client"; export { authenticateAccount, ensurePlanningIdentity } from "./lib/firebase/client"; export { state, setUser } from "planner-auth-fixture";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "isolated-browser-auth", setup(plugin) {
        plugin.onResolve({ filter: /^(?:firebase\/app|firebase\/auth|planner-auth-fixture)$/ }, () => ({ path: "planner-auth-fixture", namespace: "planner-auth-fixture" }));
        plugin.onLoad({ filter: /.*/, namespace: "planner-auth-fixture" }, () => ({ contents: sdkFixture, loader: "js" }));
      } }],
    });
    const harness: Harness = await import(pathToFileURL(output).href);
    const { state, setUser } = harness;
    const fetches: { url: string; init: RequestInit }[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
      fetches.push({ url: String(input), init });
      return Response.json({ ok: true });
    });
    const reset = () => { state.events.length = 0; state.readyWait = undefined; state.signInWait = undefined; state.tokenWait = undefined; state.onEvent = undefined; fetches.length = 0; setUser(false); };
    function started(event: string) {
      const wait = deferred();
      state.onEvent = (value) => { if (value === event) wait.resolve(); };
      return wait.promise;
    }
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

    await t.test("already aborted operations do not start account or token work", async () => {
      reset(); const controller = new AbortController(); controller.abort();
      await assert.rejects(harness.planningToken(controller.signal), { name: "AbortError" });
      await assert.rejects(harness.plannerFetch("/api/plans", { signal: controller.signal }), { name: "AbortError" });
      assert.deepEqual(state.events, []);
      assert.deepEqual(fetches, []);
    });

    await t.test("stalled auth initialization can be canceled without requesting a late planner token", async () => {
      reset(); setUser(null);
      const ready = deferred(), controller = new AbortController(); state.readyWait = ready.promise;
      const initializationStarted = started("ready");
      const pending = harness.planningToken(controller.signal);
      await initializationStarted;
      controller.abort();
      await assert.rejects(pending, { name: "AbortError" });
      assert.equal(state.events.includes("guest-sign-in"), false);
      ready.resolve();
      await harness.ensurePlanningIdentity(); await flush();
      assert.equal(state.events.filter((event) => event === "guest-sign-in").length, 1);
      assert.equal(state.events.includes("token"), false);
      assert.deepEqual(fetches, []);
    });

    await t.test("canceling one anonymous sign-in waiter preserves the shared guest identity for another", async () => {
      reset(); setUser(null);
      const signIn = deferred(), canceled = new AbortController(); state.signInWait = signIn.promise;
      const signInStarted = started("guest-sign-in");
      const first = harness.planningToken(canceled.signal);
      const second = harness.planningToken();
      await signInStarted;
      canceled.abort();
      await assert.rejects(first, { name: "AbortError" });
      assert.equal(state.events.filter((event) => event === "guest-sign-in").length, 1);
      signIn.resolve();
      assert.equal(await second, "fixture-user-token");
      assert.equal(state.events.filter((event) => event === "token").length, 1);
      assert.deepEqual(fetches, []);
    });

    await t.test("an active account transfer cannot keep canceled token and fetch callers waiting", async () => {
      reset(); const transfer = deferred(), entered = deferred();
      const transition = harness.authenticateAccount(async () => { entered.resolve(); await transfer.promise; });
      await entered.promise;
      state.events.length = 0;
      const tokenController = new AbortController(), fetchController = new AbortController();
      const token = harness.planningToken(tokenController.signal);
      const response = harness.plannerFetch("/api/plans", { signal: fetchController.signal });
      await Promise.resolve();
      tokenController.abort(); fetchController.abort();
      await assert.rejects(token, { name: "AbortError" });
      await assert.rejects(response, { name: "AbortError" });
      assert.equal(state.events.length, 0);
      transfer.resolve(); await transition; await flush();
      assert.deepEqual(fetches, []);
      assert.equal(state.events.includes("token"), false);
    });

    await t.test("the request deadline can expire during getIdToken, before a backend fetch exists", async () => {
      reset(); const token = deferred(), controller = new AbortController(); state.tokenWait = token.promise;
      const tokenStarted = started("token");
      const pending = harness.plannerFetch("/api/plans", { method: "POST", signal: controller.signal });
      await tokenStarted;
      const timeout = new DOMException("The operation timed out", "TimeoutError");
      controller.abort(timeout);
      await assert.rejects(pending, (error: unknown) => error === timeout);
      assert.deepEqual(fetches, []);
      token.resolve(); await flush();
      assert.deepEqual(fetches, []);
    });

    await t.test("late SDK rejection after cancellation is observed and cannot start a fetch", async () => {
      reset(); const token = deferred(), controller = new AbortController(); state.tokenWait = token.promise;
      const tokenStarted = started("token");
      const pending = harness.planningToken(controller.signal);
      await tokenStarted;
      controller.abort();
      await assert.rejects(pending, { name: "AbortError" });
      token.reject(new Error("Fixture late token failure")); await flush();
      assert.deepEqual(fetches, []);
    });

    await t.test("ordinary no-signal callers retain their token, request body and headers", async () => {
      reset();
      assert.equal(await harness.planningToken(), "fixture-user-token");
      const response = await harness.plannerFetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "fixture-request" }, body: "{}" });
      assert.equal(response.status, 200);
      assert.equal(fetches.length, 1);
      assert.equal(fetches[0].url, "/api/plans");
      assert.equal(fetches[0].init.body, "{}");
      const headers = new Headers(fetches[0].init.headers);
      assert.equal(headers.get("Authorization"), "Bearer fixture-user-token");
      assert.equal(headers.get("Idempotency-Key"), "fixture-request");
      assert.equal(headers.get("Content-Type"), "application/json");
      const controller = new AbortController();
      await harness.plannerFetch("/api/plans", { signal: controller.signal });
      assert.equal(fetches[1].init.signal, controller.signal);
    });
  } finally {
    for (const [name, value] of environment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
