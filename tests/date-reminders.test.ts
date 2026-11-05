import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Timestamp } from "firebase-admin/firestore";
import { dateReminderSchema, nextDateReminder, reminderCanSend, reminderRecipientHash, reminderSchedule, reminderSourceSchema } from "../lib/server/date-reminder-state";
import { dateReminderEmail } from "../lib/email/date-reminder";

const sessionId = "980026de-d315-4b23-b9fe-0f591b076202";
const placeId = "fixture-place";
const dateId = createHash("sha256").update(`${sessionId}:${placeId}`).digest("hex");
const source = reminderSourceSchema.parse({ source: "google", placeId, date: "2030-11-02", startTime: "18:00", timeZone: "Africa/Lagos", city: "Lagos", country: "Nigeria", datePreference: "weekend", duration: 180, dateStatus: "planned" });
const startsAt = Date.parse("2030-11-02T17:00:00Z");

test("reminder timing uses the saved timezone, defaults to24h, and rejects incomplete/past or nonexistent times", () => {
  assert.equal(reminderSchedule(source, startsAt - 48 * 3600000)?.sendAt.toMillis(), startsAt - 86400000);
  assert.equal(reminderSchedule(source, startsAt - 3600000)?.sendAt.toMillis(), startsAt - 3600000);
  assert.equal(reminderSchedule(source, startsAt), null);
  assert.equal(reminderSchedule({ ...source, date: "" }, startsAt - 1), null);
  assert.equal(reminderSchedule({ ...source, startTime: "" }, startsAt - 1), null);
  assert.equal(reminderSchedule({ ...source, dateStatus: "completed" }, startsAt - 1), null);
  assert.equal(reminderSchedule({ ...source, timeZone: "Europe/London", date: "2030-03-31", startTime: "01:30" }, Date.parse("2030-03-01T00:00:00Z")), null);
});

test("schedule occurrences are idempotent, replaced on edits and bound to the verified recipient", () => {
  const now = startsAt - 48 * 3600000;
  const hash = reminderRecipientHash("Owner@Example.test");
  assert.equal(hash, reminderRecipientHash("owner@example.test"));
  const first = nextDateReminder(dateId, source, hash, null, now);
  assert.ok(first);
  assert.equal(nextDateReminder(dateId, source, hash, first, now + 1), first);
  const canceled = { ...first, status: "canceled" as const };
  assert.equal(nextDateReminder(dateId, source, hash, canceled, now + 1), canceled, "Retrying the same occurrence cannot resurrect a canceled ambiguous send");
  const edited = nextDateReminder(dateId, { ...source, date: "2030-11-04" }, hash, first, now);
  assert.ok(edited);
  assert.equal(edited.revision, 2);
  assert.notEqual(edited.occurrenceId, first.occurrenceId);
  const queued = { ...first, status: "queued" as const };
  assert.equal(reminderCanSend(queued, first.occurrenceId, source, "owner@example.test", startsAt - 1000), true);
  assert.equal(reminderCanSend(queued, first.occurrenceId, source, "other@example.test", startsAt - 1000), false);
  assert.equal(reminderCanSend(queued, first.occurrenceId, { ...source, startTime: "19:00" }, "owner@example.test", startsAt - 1000), false);
  assert.equal(reminderCanSend({ ...queued, status: "canceled" }, first.occurrenceId, source, "owner@example.test", startsAt - 1000), false);
  assert.equal(reminderCanSend(queued, first.occurrenceId, source, "owner@example.test", startsAt), false);
});

test("reminder email remains private, escaped and clearly separate from a reservation", () => {
  const email = dateReminderEmail({ venueName: "A <Garden> & Co.", address: "12 Quiet Road", scheduleLabel: "Saturday · 6:00 PM" });
  assert.match(email.subject, /reminder/);
  assert.match(email.html, /A &lt;Garden&gt; &amp; Co\./);
  for (const value of ["https://adateatlas.com/saved", "not a booking confirmation", "Google Maps", "6:00 PM"]) {
    assert.ok(email.html.includes(value)); assert.ok(email.text.includes(value));
  }
  assert.ok(!email.html.includes("/invite/"));
});

type State = {
  records: Map<string, Record<string, unknown>>;
  user: { email?: string; emailVerified: boolean; disabled: boolean };
  rating?: number; operational: boolean; venueName: string; detailCalls: number; limitStatus: number;
  beforeDetails: (() => void) | null; beforeAuth: (() => void) | null; afterClaim: (() => void) | null;
};
type Harness = Pick<typeof import("../app/api/date-reminders/route"), "POST"> & Pick<typeof import("../lib/server/date-reminders"), "reconcileDateReminder" | "dispatchDueDateReminders"> & Pick<typeof import("../lib/server/date-created-email"), "sendDateCreatedEmail"> & {
  state: State; put: (path: string, record: Record<string, unknown>) => void;
};

test("reminder opt-in, durable dispatch and delivery enforce ownership, freshness and cancellation", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "reminder-test-"));
  const services: Record<string, string> = {
    "server-only": "",
    "@/lib/firebase/server": 'export { getDatabase, authenticatedClient } from "reminder-fixture"; export const getFirebaseAdmin = () => ({});',
    "firebase-admin/auth": 'import { state } from "reminder-fixture"; export const getAuth = () => ({ async getUser() { state.beforeAuth?.(); return { ...state.user }; } });',
    "@/lib/planner/rate-limit": 'import { state } from "reminder-fixture"; import { RequestError } from "@/lib/planner/http"; export async function enforcePlannerLimit() { if (state.limitStatus) throw new RequestError("Please wait a moment.",state.limitStatus); }',
    "@/lib/maps/place-details": 'import { state } from "reminder-fixture"; export async function loadPlaceDetails(_id, withPhoto) { if (withPhoto !== false) throw new Error("Reminders must not load media"); state.detailCalls++; state.beforeDetails?.(); return { place: { name: state.venueName, address: "12 Quiet Road, Lagos" }, operational: state.operational, record: { rating: state.rating } }; }',
    "@/lib/planner/catalog": 'export async function getCatalog() { return []; }',
    "./date-invitations": 'import { createHash } from "node:crypto"; export const dateSelectionId = (session,id) => createHash("sha256").update(session+":"+id).digest("hex");',
    "./account-privacy": 'import { createHash } from "node:crypto"; export const deletionKey = id => createHash("sha256").update(id).digest("hex");',
    "@/lib/server/planner-gateway": 'import { dateReminders } from "@/lib/server/actions/date-reminders"; export const plannerAction = (action,request) => { if(action!=="dateReminders") throw new Error("Wrong action"); return dateReminders(request); };',
    "reminder-fixture": `
      import { FieldValue, Timestamp } from "firebase-admin/firestore";
      export const state = { records: new Map(), versions: new Map(), user: { email: "owner@example.test", emailVerified: true, disabled: false }, rating: 4.7, operational: true, venueName: "Secret Garden", detailCalls: 0, limitStatus: 0, beforeDetails: null, beforeAuth: null, afterClaim: null };
      let revision=0;
      export function put(path,value) { state.records.set(path,value); state.versions.set(path,++revision); }
      function snapshot(target) { const value=state.records.get(target.path); return { exists:state.records.has(target.path), data:()=>value, ref:target, id:target.id, updateTime:Timestamp.fromMillis(state.versions.get(target.path)??0) }; }
      function ref(path) { return { path,id:path.split("/").at(-1), get parent() { return collection(path.split("/").slice(0,-1).join("/")); }, collection(name) { return collection(path+"/"+name); }, async get() { return snapshot(this); } }; }
      function collection(path) { return { path,id:path.split("/").at(-1), get parent() { return path.includes("/")?ref(path.split("/").slice(0,-1).join("/")):null; }, doc(id) { return ref(path+"/"+id); } }; }
      let serial=Promise.resolve();
      const db={ collection, collectionGroup(name) { const clauses=[]; let limit=100; return { where(field,op,value) { clauses.push({field,op,value}); return this; }, orderBy() { return this; }, limit(value) { limit=value; return this; }, async get() { return { docs:[...state.records].filter(([path,value])=>path.split("/").at(-2)===name && clauses.every(clause=>clause.op==="=="?value[clause.field]===clause.value:value[clause.field].toMillis()<=clause.value.toMillis())).slice(0,limit).map(([path])=>snapshot(ref(path))) }; } }; }, runTransaction(callback) {
        const operation=serial.then(async()=> { const pending=[]; const tx={ async get(target) { if(pending.length) throw new Error("Read after write"); return snapshot(target); }, set(target,value) { pending.push({kind:"set",target,value}); }, create(target,value) { pending.push({kind:"create",target,value}); }, update(target,value) { pending.push({kind:"update",target,value}); } }; const result=await callback(tx);
          for(const {kind,target,value} of pending) { if(kind==="create"&&state.records.has(target.path)) throw new Error("Duplicate job"); if(kind==="update"&&!state.records.has(target.path)) throw new Error("Missing record"); const next=kind==="update"?{...state.records.get(target.path)}:{}; for(const [key,field] of Object.entries(value)) { if(field instanceof FieldValue&&field.isEqual(FieldValue.delete())) delete next[key]; else next[key]=field; } put(target.path,next); if(value.status==="sending") state.afterClaim?.(); } return result; }); serial=operation.catch(()=>{}); return operation; } };
      export const getDatabase=()=>db;
      export async function authenticatedClient(request) { const token=request.headers.get("authorization"); return token?{db,user:{uid:"fixture-owner",firebase:{sign_in_provider:token==="Bearer anonymous"?"anonymous":"google.com"}}}:null; }
    `,
  };
  let now = startsAt - 48 * 3600000;
  t.mock.method(Date, "now", () => now);
  const requests: { key: string | null; body: string }[] = [];
  let providerFails = false;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    assert.equal(String(input), "https://api.resend.com/emails", "No real provider call may escape the fixture");
    requests.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) });
    if (providerFails) throw new Error("Fixture network interruption");
    return Response.json({ id: "fixture-reminder" });
  });
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "fixture-no-outbound-key";
  try {
    const output = join(directory, "reminders.mjs");
    await build({ stdin: { contents: 'export { POST } from "./app/api/date-reminders/route"; export { reconcileDateReminder, dispatchDueDateReminders } from "./lib/server/date-reminders"; export { sendDateCreatedEmail } from "./lib/server/date-created-email"; export { state,put } from "reminder-fixture";', resolveDir: process.cwd() }, outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolated-reminder-services", setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "reminder-services" } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: "reminder-services" }, args => ({ contents: services[args.path], loader: "js", resolveDir: process.cwd() }));
    } }] });
    const harness: Harness = await import(pathToFileURL(output).href);
    const { state, put, POST, reconcileDateReminder, dispatchDueDateReminders, sendDateCreatedEmail } = harness;
    const userPath = "users/fixture-owner";
    const historyPath = `${userPath}/dateHistory/${dateId}`;
    const reminderPath = `${userPath}/dateReminders/${dateId}`;
    const deletionPath = `accountDeletionRequests/${createHash("sha256").update("fixture-owner").digest("hex")}`;
    const req = (body: unknown = { sessionId, placeId }, token: string | null = "owner") => new Request("https://adateatlas.com/api/date-reminders", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
    const reminder = () => dateReminderSchema.parse(state.records.get(reminderPath));
    const jobPath = () => `${userPath}/emailNotifications/${reminder().occurrenceId}`;
    function reset(near = false) {
      now = startsAt - (near ? 2 : 48) * 3600000;
      state.records.clear(); requests.length = 0; providerFails = false;
      state.user = { email: "owner@example.test", emailVerified: true, disabled: false };
      state.rating = 4.7; state.operational = true; state.venueName = "Secret Garden"; state.detailCalls = 0; state.limitStatus = 0; state.beforeDetails = null; state.beforeAuth = null; state.afterClaim = null;
      put(userPath, { updatedAt: Timestamp.now() });
      put(historyPath, { ...source, planningRequest: { notes: "PRIVATE_NOTES" }, token: "PRIVATE_INVITATION_TOKEN", customTitle: "PRIVATE_TITLE" });
    }

    await t.test("opt-in requires a permanent verified account, an owned saved date and a qualifying operational venue", async () => {
      reset(); assert.equal((await POST(req(undefined, null))).status, 401); assert.equal((await POST(req(undefined, "anonymous"))).status, 401);
      state.user.emailVerified = false; assert.equal((await POST(req())).status, 403);
      state.user.emailVerified = true; state.user.disabled = true; assert.equal((await POST(req())).status, 403);
      state.user.disabled = false;
      assert.equal((await POST(req({ sessionId, placeId: "someone-elses-place" }))).status, 404);
      for (const rating of [3.75, 3.7, undefined]) { state.rating = rating; assert.equal((await POST(req())).status, 409); }
      state.rating = 4.7; state.operational = false; assert.equal((await POST(req())).status, 409);
      assert.equal(requests.length, 0); assert.equal(state.records.has(reminderPath), false);
    });
    await t.test("invalid bodies, completed dates, missing times and past dates cannot schedule", async () => {
      reset(); assert.equal((await POST(req({ sessionId, placeId, email: "arbitrary@example.test" }))).status, 400);
      assert.equal((await POST(req("{"))).status, 400); assert.equal((await POST(req(" ".repeat(18001)))).status, 413);
      state.limitStatus = 429; assert.equal((await POST(req())).status, 429); state.limitStatus = 0;
      for (const changes of [{ dateStatus: "completed" }, { date: "" }, { startTime: "" }]) { put(historyPath, { ...source, ...changes }); assert.equal((await POST(req())).status, 409); }
      put(historyPath, source); now = startsAt; assert.equal((await POST(req())).status, 409);
      assert.equal(requests.length, 0);
    });
    await t.test("concurrent repeated opt-in stores one metadata-only occurrence with the24h due time", async () => {
      reset(); const responses = await Promise.all([POST(req()), POST(req())]);
      for (const response of responses) { assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.deepEqual(await response.json(), { scheduled: true, sendAt: new Date(startsAt - 86400000).toISOString() }); }
      assert.equal(reminder().revision, 1); assert.equal(reminder().status, "scheduled");
      assert.equal([...state.records.keys()].filter(path => path.includes("emailNotifications")).length, 0);
      for (const privateValue of ["owner@example.test", "PRIVATE_NOTES", "Secret Garden", "PRIVATE_TITLE", "PRIVATE_INVITATION_TOKEN"]) assert.ok(!JSON.stringify(reminder()).includes(privateValue));
      assert.equal(await dispatchDueDateReminders(now), 0);
    });
    await t.test("due cron dispatch is idempotent and the existing worker sends one private branded reminder", async () => {
      reset(); await POST(req()); now = startsAt - 86400000 + 60000;
      assert.equal(await dispatchDueDateReminders(now), 1); assert.equal(reminder().status, "queued");
      const job = state.records.get(jobPath()); assert.ok(job); assert.equal(job.kind, "reminder"); assert.equal(job.sourceDateId, dateId); assert.equal(job.payload, undefined);
      assert.equal(await dispatchDueDateReminders(now), 0);
      await sendDateCreatedEmail("fixture-owner", reminder().occurrenceId);
      assert.equal(requests.length, 1); assert.equal(reminder().status, "sent");
      assert.match(requests[0].key ?? "", /^date-reminder\//); assert.match(requests[0].body, /A little reminder/); assert.match(requests[0].body, /Secret Garden/);
      for (const value of ["PRIVATE_NOTES", "PRIVATE_TITLE", "PRIVATE_INVITATION_TOKEN", "/invite/"]) assert.ok(!requests[0].body.includes(value));
      await sendDateCreatedEmail("fixture-owner", reminder().occurrenceId); assert.equal(requests.length, 1);
    });
    await t.test("dates within24h queue immediately rather than waiting for the cron interval", async () => {
      reset(true); assert.equal((await POST(req())).status, 200); assert.equal(reminder().status, "queued"); assert.equal(reminder().sendAt.toMillis(), now); assert.ok(state.records.has(jobPath()));
    });
    await t.test("date edits replace queued occurrences and move future schedules without sending stale mail", async () => {
      reset(true); await POST(req()); const oldJob = jobPath(); const occurrence = reminder().occurrenceId;
      put(historyPath, { ...source, date: "2030-11-05" }); await reconcileDateReminder("fixture-owner", dateId);
      assert.equal(reminder().revision, 2); assert.notEqual(reminder().occurrenceId, occurrence); assert.equal(reminder().status, "scheduled"); assert.equal(state.records.get(oldJob)?.status, "skipped");
      await sendDateCreatedEmail("fixture-owner", occurrence); assert.equal(requests.length, 0);
      await reconcileDateReminder("fixture-owner", dateId); assert.equal(reminder().revision, 2);
    });
    await t.test("deletion, completion and account deletion cancel pending delivery", async () => {
      for (const change of ["deleted", "completed", "account-deleting"]) {
        reset(true); await POST(req()); const occurrence = reminder().occurrenceId;
        if (change === "deleted") state.records.delete(historyPath);
        if (change === "completed") put(historyPath, { ...source, dateStatus: "completed" });
        if (change === "account-deleting") put(deletionPath, { status: "requested" });
        await reconcileDateReminder("fixture-owner", dateId); assert.equal(reminder().status, "canceled");
        await sendDateCreatedEmail("fixture-owner", occurrence); assert.equal(requests.length, 0);
      }
    });
    await t.test("repeated opt-in cannot resurrect a canceled occurrence, while a newly saved occurrence can opt in", async () => {
      reset(true); await POST(req()); const oldOccurrence = reminder().occurrenceId;
      put(reminderPath, { ...reminder(), status: "canceled" });
      assert.equal((await POST(req())).status, 409);
      assert.equal(reminder().occurrenceId, oldOccurrence);
      put(historyPath, { ...source, createdAt: Timestamp.fromMillis(now) });
      assert.equal((await POST(req())).status, 200);
      assert.notEqual(reminder().occurrenceId, oldOccurrence);
    });
    await t.test("sender skips changed recipients, unverified accounts, invalid venues and dates that have begun", async () => {
      for (const change of ["recipient", "unverified", "closed", "rating", "started"]) {
        reset(true); await POST(req());
        if (change === "recipient") state.user.email = "new-owner@example.test";
        if (change === "unverified") state.user.emailVerified = false;
        if (change === "closed") state.operational = false;
        if (change === "rating") state.rating = 3.75;
        if (change === "started") now = startsAt;
        await sendDateCreatedEmail("fixture-owner", reminder().occurrenceId); assert.equal(requests.length, 0); assert.equal(reminder().status, "canceled");
      }
    });
    await t.test("final delivery checks catch cancellation and elapsed dates after the lease was claimed", async () => {
      for (const change of ["canceled", "started", "date-edited"]) {
        reset(true); await POST(req());
        state.afterClaim = () => {
          if (change === "canceled") put(reminderPath, { ...reminder(), status: "canceled" });
          if (change === "started") now = startsAt;
          if (change === "date-edited") put(historyPath, { ...source, startTime: "19:00" });
        };
        await sendDateCreatedEmail("fixture-owner", reminder().occurrenceId); assert.equal(requests.length, 0);
      }
    });
    await t.test("ambiguous network retries reuse the frozen reminder body/key and recheck venue quality", async () => {
      reset(true); await POST(req()); const occurrence = reminder().occurrenceId;
      providerFails = true; await assert.rejects(sendDateCreatedEmail("fixture-owner", occurrence), /retried/);
      assert.equal(state.records.get(jobPath())?.status, "retry");
      providerFails = false; state.venueName = "Changed provider display name";
      await sendDateCreatedEmail("fixture-owner", occurrence);
      assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]); assert.equal(reminder().status, "sent"); assert.equal(state.detailCalls, 3);
    });
    await t.test("concurrent source edits during opt-in cannot schedule an outdated date", async () => {
      reset(); state.beforeDetails = () => put(historyPath, { ...source, startTime: "19:00" });
      assert.equal((await POST(req())).status, 409); assert.equal(state.records.has(reminderPath), false);
    });
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    await rm(directory, { recursive: true, force: true });
  }
});
