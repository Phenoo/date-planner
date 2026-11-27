import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Timestamp } from "firebase-admin/firestore";

type State = {
  records: Map<string, Record<string, unknown>>;
  users: Map<string, { disabled: boolean; email?: string; providerData?: { providerId: string }[] }>;
  now: number; authTime: number; limitStatus: number; disabled: string[]; removed: string[];
  beforeTransaction: (() => void) | null;
};
type Harness = Pick<typeof import("../app/api/account/privacy/route"), "GET" | "POST"> & Pick<typeof import("../lib/server/account-privacy"), "processAutomaticDeletions" | "processDeletion" | "deletionKey" | "deletionDrainMs" | "deletionWithdrawMs"> & { state: State };

test("account deletion safely schedules, withdraws, removes records and confirms completion without sweeping legacy requests", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel/privacy-check-"));
  const services: Record<string, string> = {
    "server-only": "",
    "privacy-fixture": `
      import { FieldValue, Timestamp } from 'firebase-admin/firestore';
      export const state = { records:new Map(), users:new Map(), now:Date.now(), authTime:Date.now()/1000, limitStatus:0, disabled:[], removed:[], beforeTransaction:null };
      class Snapshot { constructor(ref){ this.ref=ref;this.id=ref.id; } get exists(){ return state.records.has(this.ref.path); } data(){ return state.records.get(this.ref.path); } }
      class Query {
        constructor(path, filters=[], count=1000){ this.path=path;this.filters=filters;this.count=count; }
        where(key,op,value){ if(!['==','<='].includes(op)) throw new Error('Unexpected query');return new Query(this.path,[...this.filters,[key,op,value]],this.count); }
        limit(count){return new Query(this.path,this.filters,count);}
        async get(){const docs=[...state.records.keys()].filter(path=>path.startsWith(this.path+'/')&&!path.slice(this.path.length+1).includes('/')).filter(path=>this.filters.every(([key,op,value])=>op==='=='?state.records.get(path)?.[key]===value:state.records.get(path)?.[key]?.toMillis()<=value.toMillis())).slice(0,this.count).map(path=>new Snapshot(new Ref(path)));return {docs,empty:docs.length===0};}
        doc(id){return new Ref(this.path+'/'+id);}
      }
      class Ref {
        constructor(path){this.path=path;this.id=path.split('/').at(-1);}
        collection(name){return new Query(this.path+'/'+name);}
        async get(){return new Snapshot(this);}
        async set(data,options){state.records.set(this.path,options?.merge?{...state.records.get(this.path),...data}:data);}
        async update(data){if(!state.records.has(this.path))throw new Error('Missing document');const next={...state.records.get(this.path)};for(const [key,value] of Object.entries(data)){if(value?.isEqual?.(FieldValue.delete()))delete next[key];else next[key]=value;}state.records.set(this.path,next);}
        async delete(){state.records.delete(this.path);}
        async listCollections(){const prefixes=new Set([...state.records.keys()].filter(path=>path.startsWith(this.path+'/')).map(path=>path.slice(0,path.indexOf('/',this.path.length+1))));return [...prefixes].map(path=>new Query(path));}
      }
      export const db={collection:name=>new Query(name),runTransaction:async operation=>{const before=state.beforeTransaction;state.beforeTransaction=null;before?.();return operation({get:ref=>ref.get(),set:(ref,data,options)=>ref.set(data,options),update:(ref,data)=>ref.update(data),delete:ref=>ref.delete()});},batch:()=>{const refs=[];return{delete:ref=>refs.push(ref),commit:async()=>{for(const ref of refs)await ref.delete();}};}};
      export const auth={getUser:async uid=>{const user=state.users.get(uid);if(!user)throw Object.assign(new Error('Missing user'),{code:'auth/user-not-found'});return{uid,providerData:[],...user};},updateUser:async uid=>{const user=state.users.get(uid);if(!user)throw Object.assign(new Error('Missing user'),{code:'auth/user-not-found'});state.users.set(uid,{...user,disabled:true});state.disabled.push(uid);},revokeRefreshTokens:async()=>{},deleteUser:async uid=>{if(!state.users.delete(uid))throw Object.assign(new Error('Missing user'),{code:'auth/user-not-found'});state.removed.push(uid);}};
    `,
    "@/lib/firebase/server": `import { state, db } from 'privacy-fixture';import {createHash} from 'node:crypto';export const getDatabase=()=>db;export const getFirebaseAdmin=()=>({});export async function authenticatedClient(request){const token=request.headers.get('Authorization')?.replace('Bearer ','');if(!['member','guest'].includes(token)||state.users.get(token)?.disabled)return null;const deleted=state.records.get('accountDeletionRequests/'+createHash('sha256').update(token).digest('hex'));if(['processing','complete'].includes(deleted?.status))return null;return{db,user:{uid:token,auth_time:state.authTime,email:token==='member'?'reviewer@example.test':undefined,email_verified:token==='member',firebase:{sign_in_provider:token==='guest'?'anonymous':'password'}}};}`,
    "firebase-admin/auth": "import {auth} from 'privacy-fixture';export const getAuth=()=>auth;",
    "@/lib/planner/rate-limit": "import {state} from 'privacy-fixture';import {RequestError} from '@/lib/planner/http';export async function enforcePlannerLimit(){if(state.limitStatus)throw new RequestError('Fixture rate limit',state.limitStatus);}",
    "./membership-config": "export const membershipTestEnabled=()=>false;",
    "./billing-providers": "export async function cancelProviderSubscription(){throw new Error('No billing test configured');}",
  };
  const calls: { key: string | null; body: string }[] = [];
  let providerFails = false;
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "fixture-never-outbound";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    calls.push({ key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body) });
    return Response.json({ id: "fixture-delivery" }, { status: providerFails ? 503 : 200 });
  };
  try {
    const output = join(directory, "privacy.mjs");
    await build({ stdin: { contents: 'export {GET,POST} from "./app/api/account/privacy/route";export {processAutomaticDeletions,processDeletion,deletionKey,deletionDrainMs,deletionWithdrawMs} from "./lib/server/account-privacy";export {state} from "privacy-fixture";', resolveDir: process.cwd() }, outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolated-privacy-services", setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "privacy-services" } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: "privacy-services" }, args => ({ contents: services[args.path], loader: "js", resolveDir: process.cwd() }));
    } }] });
    const { GET, POST, processAutomaticDeletions, processDeletion, deletionKey, deletionDrainMs, deletionWithdrawMs, state }: Harness = await import(pathToFileURL(output).href);
    Date.now = () => state.now;
    const request = (body: unknown, token: "member" | "guest" | null = "member") => new Request("https://adateatlas.com/api/account/privacy", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const status = (receipt: string) => GET(new Request("https://adateatlas.com/api/account/privacy", { headers: { "x-deletion-receipt": receipt } }));
    const jobPath = (uid = "member") => `accountDeletionRequests/${deletionKey(uid)}`;
    function reset() {
      state.records.clear(); state.users.clear(); state.users.set("member", { disabled: false }); state.users.set("guest", { disabled: false });
      state.now = originalNow(); state.authTime = state.now / 1000; state.limitStatus = 0; state.disabled.length = 0; state.removed.length = 0; calls.length = 0; providerFails = false;
      state.beforeTransaction = null;
    }
    async function schedule(token: "member" | "guest" = "member") {
      const response = await POST(request({ action: "request", processing: "automatic-v1" }, token));
      assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
      const body: unknown = await response.json();
      assert.ok(body && typeof body === "object" && "receipt" in body && typeof body.receipt === "string");
      return body.receipt;
    }

    await t.test("new explicit opt-in, fresh auth and valid actions are required; legacy queue remains manual", async () => {
      reset();
      assert.equal((await POST(request({ action: "request", processing: "automatic-v1" }, null))).status, 401);
      assert.equal((await POST(request({ action: "delete", processing: "automatic-v1" }))).status, 400);
      state.authTime = (state.now - 11 * 60000) / 1000;
      assert.equal((await POST(request({ action: "request", processing: "automatic-v1" }))).status, 401);
      state.authTime = state.now / 1000;
      assert.equal((await POST(request({ action: "request" }))).status, 200);
      assert.equal(state.records.get(jobPath())?.automaticVersion, undefined);
      assert.equal((await POST(request({ action: "request", processing: "automatic-v1" }))).status, 409);
      state.now += 86400000;
      assert.equal(await processAutomaticDeletions(), 0); assert.equal(state.disabled.length, 0); assert.equal(state.removed.length, 0);
    });
    await t.test("repeated requests preserve the withdrawal deadline; withdrawing prevents processing", async () => {
      reset(); const first = await schedule(); const originalDeadline = state.records.get(jobPath())?.processAfter;
      assert.ok(originalDeadline instanceof Timestamp);
      assert.equal(originalDeadline.toMillis(), state.now + deletionWithdrawMs);
      state.now += 60000; const second = await schedule();
      const repeatedDeadline = state.records.get(jobPath())?.processAfter;
      assert.ok(repeatedDeadline instanceof Timestamp);
      assert.equal(repeatedDeadline.toMillis(), originalDeadline.toMillis());
      assert.notEqual(first, second);
      assert.equal((await status(first)).status, 404);
      assert.equal((await POST(request({ action: "cancel", processing: "automatic-v1" }))).status, 200);
      state.now += 86400000;
      assert.equal(await processAutomaticDeletions(), 0); assert.equal(state.disabled.length, 0); assert.equal((await status(second)).status, 404);
    });
    await t.test("email is sent only after the drain and actual owned-data deletion; receipt contains no identity", async () => {
      reset(); const receipt = await schedule();
      state.records.set("users/member", { private: "PRIVATE_PROFILE" });
      state.records.set("users/member/dateHistory/date", { private: "PRIVATE_DATE" });
      state.records.set("users/member/emailNotifications/queued", { private: "PRIVATE_QUEUED_EMAIL" });
      state.records.set("dateInvitations/owned", { ownerId: "member" });
      state.records.set("dateInvitations/other", { ownerId: "guest" });
      state.records.set(`sharedWishlists/${deletionKey("member")}`, { private: "PRIVATE_WISHLIST" });
      assert.equal(await processAutomaticDeletions(), 0); assert.equal(state.disabled.length, 0);
      state.now += deletionWithdrawMs + 1;
      assert.equal(await processAutomaticDeletions(), 0); assert.equal(state.users.get("member")?.disabled, true); assert.equal(calls.length, 0);
      assert.equal((await POST(request({ action: "cancel", processing: "automatic-v1" }))).status, 401);
      state.now += deletionDrainMs + 1;
      assert.equal(await processAutomaticDeletions(), 1);
      assert.equal(state.users.has("member"), false); assert.equal(state.records.has("users/member"), false);
      assert.equal([...state.records.keys()].some(path => path.startsWith("users/member/")), false);
      assert.equal(state.records.has("dateInvitations/owned"), false); assert.equal(state.records.has("dateInvitations/other"), true);
      assert.equal(state.records.has(`sharedWishlists/${deletionKey("member")}`), false);
      assert.equal(calls.length, 1); assert.equal(calls[0].key, `account-deleted/${deletionKey("member")}`);
      for (const value of ["PRIVATE_PROFILE", "PRIVATE_DATE", "PRIVATE_QUEUED_EMAIL", "PRIVATE_WISHLIST"]) assert.equal(calls[0].body.includes(value), false);
      assert.deepEqual(await (await status(receipt)).json(), { status: "complete", automatic: false, processAfter: null });
      assert.equal(JSON.stringify(state.records.get(jobPath())).includes("reviewer@example.test"), false);
      assert.equal(state.records.get(jobPath())?.targetUid, undefined);
      assert.equal(await processAutomaticDeletions(), 0); assert.equal(calls.length, 1);
    });
    await t.test("guest deletion works without an email; private status is accessible after identity removal", async () => {
      reset(); const receipt = await schedule("guest");
      assert.equal(state.records.get(jobPath("guest"))?.confirmationEmail, undefined);
      state.now += deletionWithdrawMs + 1; await processAutomaticDeletions();
      state.now += deletionDrainMs + 1; assert.equal(await processAutomaticDeletions(), 1);
      assert.equal(state.users.has("guest"), false); assert.equal(calls.length, 0);
      assert.equal((await (await status(receipt)).json()).status, "complete");
      state.now += 31 * 86400000; assert.equal((await status(receipt)).status, 404);
    });
    await t.test("failed confirmation is retried with the same recipient, body and provider idempotency key", async () => {
      reset(); const receipt = await schedule();
      state.now += deletionWithdrawMs + 1; await processAutomaticDeletions(); state.now += deletionDrainMs + 1;
      providerFails = true; assert.equal(await processAutomaticDeletions(), 0);
      assert.equal(state.users.has("member"), false); assert.equal((await (await status(receipt)).json()).status, "processing");
      providerFails = false; state.now += 5 * 60000; assert.equal(await processAutomaticDeletions(), 1);
      assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
    });
    await t.test("direct processing cannot bypass the withdrawal window or process the operator account", async () => {
      reset(); await schedule();
      await assert.rejects(processDeletion(deletionKey("member"), "member"), /Another administrator/);
      await assert.rejects(processDeletion(deletionKey("member"), "operator"), /withdrawal window/);
      assert.equal(state.disabled.length, 0);
      assert.equal((await status("invalid")).status, 404);
      state.limitStatus = 429; assert.equal((await status("a".repeat(64))).status, 429);
    });
    await t.test("a withdrawn and replaced request cannot inherit a worker's earlier consent or deadline", async () => {
      reset(); await schedule(); state.now += deletionWithdrawMs + 1;
      const newDeadline = state.now + deletionWithdrawMs;
      state.beforeTransaction = () => state.records.set(jobPath(), { ...state.records.get(jobPath()), requestedAt: Timestamp.fromMillis(state.now), processAfter: Timestamp.fromMillis(newDeadline) });
      assert.equal(await processAutomaticDeletions(), 0);
      assert.equal(state.disabled.length, 0);
      const deadline = state.records.get(jobPath())?.processAfter; assert.ok(deadline instanceof Timestamp); assert.equal(deadline.toMillis(), newDeadline);
    });
    await t.test("a receipt refreshed before processing remains valid through completion", async () => {
      reset(); const first = await schedule(); const second = "b".repeat(64); state.now += deletionWithdrawMs + 1;
      state.beforeTransaction = () => state.records.set(jobPath(), { ...state.records.get(jobPath()), receiptHash: createHash("sha256").update(second).digest("hex") });
      await processAutomaticDeletions(); state.now += deletionDrainMs + 1; assert.equal(await processAutomaticDeletions(), 1);
      assert.equal((await status(first)).status, 404); assert.equal((await (await status(second)).json()).status, "complete");
    });
    await t.test("all transferred anonymous sources are disabled and drained before their private copies and identities are erased", async () => {
      reset(); const receipt = await schedule();
      for (const uid of ["old-guest-one", "old-guest-two"]) {
        state.users.set(uid, { disabled: false });
        state.records.set(`users/${uid}`, { transferredTo: "member" });
        state.records.set(`users/${uid}/discoverySessions/private`, { privateRequest: "PRIVATE_GUEST_NOTES" });
        state.records.set(`users/${uid}/datePlans/private`, { privateRequest: "PRIVATE_GUEST_PLAN" });
        state.records.set(`dateInvitations/${uid}`, { ownerId: uid });
      }
      state.now += deletionWithdrawMs + 1; await processAutomaticDeletions();
      for (const uid of ["old-guest-one", "old-guest-two"]) {
        assert.equal(state.users.get(uid)?.disabled, true);
        assert.equal(state.records.has(`users/${uid}/discoverySessions/private`), true);
      }
      assert.equal(calls.length, 0);
      state.now += deletionDrainMs - 1; assert.equal(await processAutomaticDeletions(), 0); assert.equal(state.removed.length, 0);
      state.now += 2;
      let complete = false;
      for (let pass = 0; pass < 10; pass++) {
        if (await processAutomaticDeletions() === 1) { complete = true; break; }
        assert.equal(calls.length, 0);
        state.now += 5 * 60000;
      }
      assert.equal(complete, true);
      for (const uid of ["old-guest-one", "old-guest-two"]) {
        assert.equal(state.users.has(uid), false);
        assert.equal([...state.records.keys()].some(path => path === `users/${uid}` || path.startsWith(`users/${uid}/`)), false);
        assert.equal(state.records.has(`dateInvitations/${uid}`), false);
      }
      assert.equal((await (await status(receipt)).json()).status, "complete"); assert.equal(calls.length, 1);
    });
    await t.test("upgraded source identities and their independent data are preserved, even if upgrade finishes during the drain", async () => {
      for (const duringDrain of [false, true]) {
        reset(); await schedule();
        state.users.set("upgraded-source", duringDrain ? { disabled: false } : { disabled: false, email: "other@example.test", providerData: [{ providerId: "password" }] });
        state.records.set("users/upgraded-source", { transferredTo: "member", independent: "KEEP_PROFILE" });
        state.records.set("users/upgraded-source/datePlans/new", { independent: "KEEP_NEW_PLAN" });
        state.now += deletionWithdrawMs + 1; await processAutomaticDeletions();
        if (duringDrain) state.users.set("upgraded-source", { disabled: true, email: "other@example.test", providerData: [{ providerId: "password" }] });
        state.now += deletionDrainMs + 1; assert.equal(await processAutomaticDeletions(), 1);
        assert.equal(state.users.has("upgraded-source"), true);
        assert.equal(state.records.get("users/upgraded-source/datePlans/new")?.independent, "KEEP_NEW_PLAN");
        assert.equal(state.records.get("users/upgraded-source")?.transferredTo, undefined);
        if (duringDrain) assert.equal(state.records.get("users/upgraded-source")?.deletionAccessReview, true);
      }
    });
  } finally {
    Date.now = originalNow; globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousKey;
    await rm(directory, { recursive: true, force: true });
  }
});
