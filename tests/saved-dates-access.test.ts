import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import { build } from "esbuild";

type FixtureState = {
  available: boolean;
  user: { uid: string; isAnonymous: boolean } | null;
  ready: Promise<void>;
  transition: Promise<void>;
  pendingTransfer: boolean;
  emailLink: boolean;
  authListeners: Set<() => void>;
  transferListeners: Set<() => void>;
};
type AccessHarness = { state: FixtureState; observeSavedDatesAccess: (onChange: (state: string) => void) => () => void };

function deferred() {
  let resolve = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("saved-date access waits for account readiness and guest transfers", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "saved-access-test-"));
  const services: Record<string, string> = {
    "next/navigation": "export const useRouter = () => ({}); export const useSearchParams = () => new URLSearchParams();",
    "firebase/auth": 'import { state } from "saved-access-fixture"; export function onIdTokenChanged(_auth, listener) { state.authListeners.add(listener); return () => state.authListeners.delete(listener); }',
    "@/lib/firebase/client": `
      import { state } from "saved-access-fixture";
      const auth = { get currentUser() { return state.user; }, authStateReady() { return state.ready; } };
      export const getBrowserAuth = () => state.available ? auth : null;
      export const hasEmailSignInLink = () => state.emailLink;
      export const hasPendingAccountTransfer = () => state.pendingTransfer;
      export const waitForAccountTransition = () => state.transition;
      export function subscribeAccountTransfer(listener) { state.transferListeners.add(listener); return () => state.transferListeners.delete(listener); }
    `,
    "./account-access": "export const AccountAccess = () => null;",
    "./auth-screen": "export const AuthScreen = () => null;",
    "saved-access-fixture": "export const state = { available: true, user: null, ready: Promise.resolve(), transition: Promise.resolve(), pendingTransfer: false, emailLink: false, authListeners: new Set(), transferListeners: new Set() };",
  };
  try {
    const output = join(directory, "access.mjs");
    await build({
      stdin: { contents: 'export { observeSavedDatesAccess } from "./components/date-atlas/saved-dates-access"; export { state } from "saved-access-fixture";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", logLevel: "silent",
      plugins: [{ name: "saved-access-services", setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "access-fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "access-fixture" }, (args) => ({ contents: services[args.path], loader: "js" }));
      } }],
    });
    const harness: AccessHarness = await import(pathToFileURL(output).href);
    const { state } = harness;
    let cleanup = () => {};
    const events: string[] = [];
    function start() {
      cleanup(); events.length = 0;
      state.available = true; state.user = null; state.ready = Promise.resolve(); state.transition = Promise.resolve(); state.pendingTransfer = false; state.emailLink = false;
    }
    function observe() { cleanup = harness.observeSavedDatesAccess((value) => events.push(value)); }
    const authChanged = () => state.authListeners.forEach((notify) => notify());
    const transferChanged = () => state.transferListeners.forEach((notify) => notify());
    try {
      await t.test("a remembered permanent account is not treated as signed out before Firebase is ready", async () => {
        start(); const ready = deferred(); state.ready = ready.promise;
        observe(); await setImmediate(); assert.deepEqual(events, []);
        state.user = { uid: "member", isAnonymous: false }; ready.resolve();
        await setImmediate(); assert.equal(events.at(-1), "signed-in");
      });
      await t.test("anonymous visitors need sign-in and valid email links retain the completion path", async () => {
        start(); state.user = { uid: "guest", isAnonymous: true }; observe();
        await setImmediate(); assert.equal(events.at(-1), "sign-in");
        state.emailLink = true; authChanged();
        await setImmediate(); assert.equal(events.at(-1), "email-link");
        state.emailLink = false; authChanged();
        await setImmediate(); assert.equal(events.at(-1), "sign-in");
      });
      await t.test("auth events cannot redirect before a transfer finishes and failed transfers remain retryable", async () => {
        start(); state.user = { uid: "guest", isAnonymous: true }; observe(); await setImmediate();
        const moving = deferred(); state.transition = moving.promise; state.user = { uid: "member", isAnonymous: false }; authChanged();
        await setImmediate(); assert.deepEqual(events, ["sign-in"]);
        state.pendingTransfer = true; moving.reject(new Error("Test-only interrupted merge")); state.transition = Promise.resolve(); transferChanged();
        await setImmediate(); assert.equal(events.at(-1), "sign-in"); assert.ok(!events.includes("signed-in"));
        const retry = deferred(); state.transition = retry.promise; transferChanged();
        await setImmediate(); assert.equal(events.at(-1), "sign-in");
        state.pendingTransfer = false; retry.resolve(); state.transition = Promise.resolve(); transferChanged();
        await setImmediate(); assert.equal(events.at(-1), "signed-in");
      });
      await t.test("signing out invalidates older asynchronous checks without reopening My dates", async () => {
        start(); state.user = { uid: "member", isAnonymous: false }; observe(); await setImmediate();
        assert.equal(events.at(-1), "signed-in");
        const moving = deferred(); state.transition = moving.promise; authChanged();
        state.user = null; authChanged(); const signedOutAt = events.length;
        assert.equal(events.at(-1), "checking");
        moving.resolve(); await setImmediate();
        assert.equal(events.at(-1), "sign-in"); assert.ok(!events.slice(signedOutAt).includes("signed-in"));
      });
      await t.test("same-account token refreshes do not hide the saved-date screen", async () => {
        start(); state.user = { uid: "member", isAnonymous: false }; observe(); await setImmediate();
        authChanged(); await setImmediate();
        assert.ok(events.every((value) => value === "signed-in"));
      });
      await t.test("reactivating a cached page waits for the current account and ignores an old account check", async () => {
        start(); state.user = { uid: "first-member", isAnonymous: false }; observe(); await setImmediate();
        assert.equal(events.at(-1), "signed-in");
        const oldTransition = deferred(); state.transition = oldTransition.promise; authChanged(); await setImmediate();
        cleanup(); events.length = 0;
        const currentReady = deferred(); state.ready = currentReady.promise; state.transition = Promise.resolve();
        state.user = null; observe();
        oldTransition.resolve(); await setImmediate();
        assert.deepEqual(events, [], "Cached authenticated state cannot resolve before the fresh auth check");
        currentReady.resolve(); await setImmediate();
        assert.deepEqual(events, ["sign-in"], "The reactivated page uses the current signed-out session");
      });
      await t.test("unmount cleans subscriptions and suppresses late readiness results", async () => {
        start(); const ready = deferred(); state.ready = ready.promise; observe();
        assert.equal(state.authListeners.size, 1); assert.equal(state.transferListeners.size, 1);
        cleanup(); assert.equal(state.authListeners.size, 0); assert.equal(state.transferListeners.size, 0);
        ready.resolve(); await setImmediate(); assert.deepEqual(events, []);
      });
      await t.test("a callback already queued before cleanup cannot update an unmounted gate", async () => {
        start(); state.user = { uid: "member", isAnonymous: false }; observe(); await setImmediate();
        const queued = [...state.authListeners][0];
        assert.ok(queued); cleanup(); const count = events.length;
        state.user = null; queued(); await setImmediate();
        assert.equal(events.length, count);
      });
      await t.test("missing client configuration fails closed without waiting forever", async () => {
        start(); state.available = false; observe(); await setImmediate();
        assert.deepEqual(events, ["sign-in"]);
        assert.equal(state.authListeners.size, 0); assert.equal(state.transferListeners.size, 0);
      });
    } finally { cleanup(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
