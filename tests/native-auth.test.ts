import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Timestamp } from "firebase-admin/firestore";
import { nativeGoogleSignIn } from "../lib/firebase/native-google-sign-in";
import { nativeAuthCompleteSchema } from "../lib/firebase/native-auth";

type Harness = {
  POST: (request: Request) => Promise<Response>;
  records: Map<string, Record<string, unknown>>;
  state: { disabled: boolean; deleted: boolean; blocked: boolean; authAge: number; tokens: string[] };
};

const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("hex");
function request(body: unknown, token?: string, origin = "https://app.example") {
  return new Request("https://app.example/api/auth/native", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

test("native Google authentication uses an expiring, verifier-bound, single-use exchange", async t => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "native-auth-test-"));
  const fixture = `
    import { RequestError } from "@/lib/planner/http";
    export const records = new Map();
    export const state = { disabled: false, deleted: false, blocked: false, authAge: 0, tokens: [] };
    const snapshot = (key) => ({ data: () => records.get(key) });
    const ref = (key) => ({ key, get: async () => snapshot(key), create: async (data) => { if (records.has(key)) throw new Error("Duplicate session"); records.set(key, { ...data }); } });
    let tail = Promise.resolve();
    const db = {
      collection: (name) => ({ doc: (id) => ref(name + "/" + id) }),
      runTransaction: (operation) => {
        const work = tail.then(() => operation({
          get: async (doc) => snapshot(doc.key),
          set: (doc, data) => records.set(doc.key, { ...records.get(doc.key), ...data }),
          delete: (doc) => records.delete(doc.key)
        }));
        tail = work.catch(() => {});
        return work;
      }
    };
    export const getDatabase = () => db;
    export const getFirebaseAdmin = () => ({});
    export const getAuth = () => ({
      getUser: async () => ({ disabled: state.disabled }),
      createCustomToken: async (uid) => { state.tokens.push(uid); return "custom-token-for-" + uid; }
    });
    export async function authenticatedClient(request) {
      const token = request.headers.get("authorization")?.replace("Bearer ", "");
      if (!token || state.deleted) return null;
      return { user: { uid: token === "other" ? "other-member" : "member", auth_time: Math.floor(Date.now() / 1000) - state.authAge, firebase: { sign_in_provider: token === "password" ? "password" : token === "anonymous" ? "anonymous" : "google.com" } } };
    }
    export async function enforcePlannerLimit(_request, bucket) {
      if (bucket !== "authentication") throw new Error("Wrong rate-limit bucket");
      if (state.blocked) throw new RequestError("Please wait and try again.", 429);
    }
  `;
  try {
    const output = join(directory, "native-auth.mjs");
    await build({
      stdin: { contents: 'export { POST } from "./app/api/auth/native/route"; export { records, state } from "native-auth-fixture";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{ name: "native-auth-services", setup(builder) {
        builder.onResolve({ filter: /^(native-auth-fixture|@\/lib\/firebase\/server|@\/lib\/planner\/rate-limit|firebase-admin\/auth)$/ }, () => ({ path: "native-auth-fixture", namespace: "native-auth" }));
        builder.onLoad({ filter: /.*/, namespace: "native-auth" }, () => ({ contents: fixture, loader: "js", resolveDir: process.cwd() }));
      } }],
    });
    const { POST, records, state }: Harness = await import(pathToFileURL(output).href);
    async function start() {
      const response = await POST(request({ action: "start", challenge }));
      assert.equal(response.status, 200);
      const result: unknown = await response.json();
      assert.ok(result && typeof result === "object" && "sessionId" in result && typeof result.sessionId === "string");
      return result.sessionId;
    }
    async function completed() {
      const sessionId = await start();
      const response = await POST(request({ action: "complete", sessionId }, "google"));
      assert.equal(response.status, 200);
      return { sessionId, ...nativeAuthCompleteSchema.parse(await response.json()) };
    }
    await t.test("only a recent Google sign-in can complete the browser handoff", async () => {
      const sessionId = await start();
      for (const token of [undefined, "anonymous", "password"]) assert.equal((await POST(request({ action: "complete", sessionId }, token))).status, 401);
      state.authAge = 301;
      assert.equal((await POST(request({ action: "complete", sessionId }, "google"))).status, 401);
      state.authAge = 0;
      assert.equal((await POST(request({ action: "complete", sessionId }, "google"))).status, 200);
      assert.equal((await POST(request({ action: "complete", sessionId }, "other"))).status, 409);
      assert.deepEqual(state.tokens, []);
    });
    await t.test("completion never exposes a token and only the originating verifier can redeem it once", async () => {
      const { sessionId, code } = await completed();
      const before = state.tokens.length;
      assert.equal((await POST(request({ action: "exchange", sessionId, code, verifier: "b".repeat(64) }))).status, 403);
      assert.equal((await POST(request({ action: "exchange", sessionId, code: "b".repeat(64), verifier }))).status, 403);
      assert.equal((await POST(request({ action: "exchange", sessionId, verifier }))).status, 400);
      assert.equal(state.tokens.length, before);
      const response = await POST(request({ action: "exchange", sessionId, verifier, code }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), { customToken: "custom-token-for-member" });
      assert.equal(records.has(`nativeAuthSessions/${sessionId}`), false);
      assert.equal((await POST(request({ action: "exchange", sessionId, verifier, code }))).status, 410);
    });
    await t.test("pending, expired and deleted sessions cannot produce credentials", async () => {
      const sessionId = await start();
      assert.equal((await POST(request({ action: "exchange", sessionId, verifier, code: "c".repeat(64) }))).status, 409);
      const key = `nativeAuthSessions/${sessionId}`;
      records.set(key, { ...records.get(key), expiresAt: Timestamp.fromMillis(Date.now() - 1) });
      assert.equal((await POST(request({ action: "complete", sessionId }, "google"))).status, 410);
      assert.equal((await POST(request({ action: "exchange", sessionId, verifier, code: "c".repeat(64) }))).status, 410);
    });
    await t.test("simultaneous exchanges return a token to only one caller", async () => {
      const { sessionId, code } = await completed();
      const responses = await Promise.all([POST(request({ action: "exchange", sessionId, verifier, code })), POST(request({ action: "exchange", sessionId, verifier, code }))]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 410]);
    });
    await t.test("disabled accounts and accounts being deleted cannot reenter the app", async () => {
      const { sessionId, code } = await completed();
      state.disabled = true;
      assert.equal((await POST(request({ action: "exchange", sessionId, verifier, code }))).status, 403);
      state.disabled = false;
      const key = `accountDeletionRequests/${createHash("sha256").update("member").digest("hex")}`;
      for (const status of ["processing", "complete"]) {
        records.set(key, { status });
        assert.equal((await POST(request({ action: "exchange", sessionId, verifier, code }))).status, 403);
      }
      records.delete(key);
    });
    await t.test("malformed, cross-origin and rate-limited requests fail without issuing tokens", async () => {
      const before = state.tokens.length;
      assert.equal((await POST(request({ action: "start", challenge }, undefined, "https://other.example"))).status, 403);
      assert.equal((await POST(request({ action: "start", challenge: "invalid" }))).status, 400);
      assert.equal((await POST(request({ action: "exchange", sessionId: "a".repeat(64), verifier, extra: true }))).status, 400);
      state.blocked = true;
      const response = await POST(request({ action: "start", challenge }));
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      state.blocked = false;
      assert.equal(state.tokens.length, before);
    });
    await t.test("the web client completes the same exchange after a native browser return", async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, "window");
      const window = new EventTarget();
      Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(window, { setTimeout, clearTimeout }) });
      t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => POST(new Request("https://app.example/api/auth/native", { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Origin: "https://app.example" } })));
      const onStart = (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        const detail: unknown = event.detail;
        assert.ok(detail && typeof detail === "object" && "sessionId" in detail && typeof detail.sessionId === "string");
        const sessionId = detail.sessionId;
        void POST(request({ action: "complete", sessionId }, "google")).then(async response => {
          assert.equal(response.status, 200);
          const { code } = nativeAuthCompleteSchema.parse(await response.json());
          window.dispatchEvent(new CustomEvent("dateatlas:google-sign-in-result", { detail: { sessionId, code } }));
        }).catch(() => window.dispatchEvent(new CustomEvent("dateatlas:google-sign-in-result", { detail: { sessionId, error: "OperationError" } })));
      };
      window.addEventListener("dateatlas:google-sign-in", onStart);
      try {
        assert.equal(await nativeGoogleSignIn(), "custom-token-for-member");
        assert.equal(getEventListeners(window, "dateatlas:google-sign-in-result").length, 0);
      } finally {
        window.removeEventListener("dateatlas:google-sign-in", onStart);
        t.mock.restoreAll();
        if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
      }
    });
    await t.test("canceling the native browser cleans up the listener without exchanging a token", async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, "window");
      const window = new EventTarget();
      Object.defineProperty(globalThis, "window", { configurable: true, value: Object.assign(window, { setTimeout, clearTimeout }) });
      const before = state.tokens.length;
      t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => POST(new Request("https://app.example/api/auth/native", { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Origin: "https://app.example" } })));
      window.addEventListener("dateatlas:google-sign-in", event => {
        if (!(event instanceof CustomEvent)) return;
        const detail: unknown = event.detail;
        if (detail && typeof detail === "object") window.dispatchEvent(new CustomEvent("dateatlas:google-sign-in-result", { detail: { ...detail, error: "AbortError" } }));
      });
      try {
        await assert.rejects(nativeGoogleSignIn(), /was closed/);
        assert.equal(state.tokens.length, before);
        assert.equal(getEventListeners(window, "dateatlas:google-sign-in-result").length, 0);
      } finally {
        t.mock.restoreAll();
        if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
      }
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
