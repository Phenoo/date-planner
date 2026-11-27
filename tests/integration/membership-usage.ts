import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase, getFirebaseAdmin } from "../../lib/firebase/server";
import { getAuth } from "firebase-admin/auth";
import { savedDocumentId } from "../../lib/firebase/paths";
import { getMembershipUsageSnapshot, reserveMembershipUsage, settleMembershipUsage, transferMembershipUsage, requireOwnedActivities, ownedMembershipContext } from "../../lib/server/membership-usage";
import { coordinateGeneration } from "../../lib/server/generation-coordinator";
import { generateSchema, type RecommendationResult } from "../../lib/planner/schema";
import { recurringDateScheduleSchema } from "../../lib/membership/recurring-date-night";
import { addCalendarDays, zonedNow } from "../../lib/planner/schedule";
import { deletionKey } from "../../lib/server/account-privacy";
import { POST as recurring } from "../../app/api/membership/recurring/route";
import { POST as dispatch } from "../../app/api/membership/recurring/dispatch/route";
import { POST as openDate } from "../../app/api/plans/context/route";
import { invitations } from "../../lib/server/actions/invitations";
import { z } from "zod";

if (process.env.FIREBASE_PROJECT_ID !== "demo-date-atlas" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Membership checks only run against the local demo emulators.");
process.env.DATE_ATLAS_BILLING_MODE = "test";
const db = getDatabase();
const uid = `membership-free-${randomUUID()}`;
const reserve = (owner: string, key = randomUUID(), hash = "same-answers", kind: "plans" | "changes" = "plans", until = Date.now() + 90000) => db.runTransaction((tx) => reserveMembershipUsage(tx, db, owner, key, hash, randomUUID(), kind, until));
const settle = (owner: string, reservation: Awaited<ReturnType<typeof reserve>>, success: boolean) => db.runTransaction((tx) => settleMembershipUsage(tx, db, owner, reservation, success));
const isStatus = (status: number) => (error: unknown) => error instanceof Error && "status" in error && error.status === status;
assert.equal((await getMembershipUsageSnapshot(db, uid)).plans.remaining, 1);

const results = await Promise.allSettled([reserve(uid), reserve(uid)]);
assert.equal(results.filter((result) => result.status === "fulfilled").length, 1, "Concurrent tabs cannot reserve the same free allowance twice");
const reserved = results.find((result) => result.status === "fulfilled");
assert.ok(reserved?.status === "fulfilled");
assert.equal((await getMembershipUsageSnapshot(db, uid)).plans.remaining, 0);
assert.equal((await getMembershipUsageSnapshot(db, uid)).plans.used, 0);
await settle(uid, reserved.value, false);
assert.equal((await getMembershipUsageSnapshot(db, uid)).plans.remaining, 1, "Empty results and provider failures release the allowance");

const key = randomUUID();
const failed = await reserve(uid, key);
await settle(uid, failed, false);
await assert.rejects(reserve(uid, key, "changed-answers"), isStatus(409));
const retry = await reserve(uid, key);
await settle(uid, retry, true);
await settle(uid, retry, true);
assert.equal((await getMembershipUsageSnapshot(db, uid)).plans.used, 1, "Repeated settlement cannot consume twice");
await assert.rejects(reserve(uid, key), isStatus(409), "A consumed intent cannot rerun after its response cache expires");
await assert.rejects(reserve(uid), isStatus(402));
await assert.rejects(reserve(uid, randomUUID(), "same-answers", "changes"), isStatus(402));

const expiredUid = `membership-expired-${randomUUID()}`;
const expired = await reserve(expiredUid, randomUUID(), "same-answers", "plans", Date.now() - 1);
const replacement = await reserve(expiredUid);
await assert.rejects(settle(expiredUid, expired, true), isStatus(409), "An expired worker cannot finish after its allowance was reclaimed");
await settle(expiredUid, expired, false);
await settle(expiredUid, replacement, true);
assert.equal((await getMembershipUsageSnapshot(db, expiredUid)).plans.used, 1);

const plusUid = `membership-plus-${randomUUID()}`;
await db.collection("users").doc(plusUid).collection("membership").doc("current").set({ provider: "polar", subscriptionId: "TEST_SUBSCRIPTION", customerId: "TEST_CUSTOMER", status: "active", paidPeriodStart: Date.now() - 1000, paidPeriodEnd: Date.now() + 86400000, cancelAtPeriodEnd: false, updatedAt: Date.now() });
for (let index = 0; index < 5; index++) await settle(plusUid, await reserve(plusUid), true);
for (let index = 0; index < 3; index++) await settle(plusUid, await reserve(plusUid, randomUUID(), "same-answers", "changes"), true);
const full = await getMembershipUsageSnapshot(db, plusUid);
assert.deepEqual(full.plans, { limit: null, remaining: null, used: 5 });
assert.deepEqual(full.changes, { limit: null, remaining: null, used: 3 });
await db.collection("users").doc(plusUid).collection("membership").doc("current").update({ cancelAtPeriodEnd: true });
assert.equal((await getMembershipUsageSnapshot(db, plusUid)).tier, "plus", "Canceling renewal preserves already-paid access");

const destination = `membership-destination-${randomUUID()}`;
await db.runTransaction(async (tx) => {
  await transferMembershipUsage(tx, db, uid, destination);
  tx.set(db.collection("users").doc(uid), { transferredTo: destination }, { merge: true });
});
await db.runTransaction((tx) => transferMembershipUsage(tx, db, uid, destination));
assert.equal((await getMembershipUsageSnapshot(db, destination)).plans.used, 1, "Guest-to-account transfer preserves usage exactly once");
await assert.rejects(reserve(destination, key), isStatus(409));
await assert.rejects(reserve(uid), isStatus(401));

const signup = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-only-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
const identity: unknown = await signup.json();
assert.ok(identity && typeof identity === "object" && "idToken" in identity && typeof identity.idToken === "string" && "localId" in identity && typeof identity.localId === "string");
const request = new Request("http://localhost/test", { headers: { Authorization: `Bearer ${identity.idToken}` } });
const planId = "TEST_OWNED_PLAN";
await db.collection("users").doc(identity.localId).collection("datePlans").doc(savedDocumentId(planId)).set({ record: { id: planId, activities: [{ experience: { id: "VENUE_ONE" } }, { experience: { id: "VENUE_TWO" } }] }, expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
await requireOwnedActivities(request, planId, ["VENUE_TWO", "VENUE_ONE"]);
await assert.rejects(requireOwnedActivities(request, planId, ["FORGED_VENUE", "VENUE_ONE"]), isStatus(403));
await assert.rejects(requireOwnedActivities(request, undefined, ["VENUE_ONE"]), isStatus(409));
await assert.rejects(ownedMembershipContext(request, { kind: "plan", id: "ANOTHER_USERS_PLAN" }), isStatus(409));
await assert.rejects(ownedMembershipContext(request, { kind: "discovery", id: randomUUID() }), isStatus(409));

const input = generateSchema.parse({ request: { city: "Lagos", area: "Lekki", country: "Nigeria", occasion: "Romantic date", budget: null, vibes: ["Romantic"], date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), startTime: "18:00", timeZone: "Africa/Lagos", timeZoneConfirmed: true, durationMode: "estimated" } });
const generationRequest = (key: string) => new Request("http://localhost/api/plans", { method: "POST", headers: { Authorization: `Bearer ${identity.idToken}`, "Idempotency-Key": key } });
const empty: RecommendationResult = { plans: [], warnings: [], diagnostics: [], source: "firebase", ai: false };
const emptyKey = randomUUID();
await coordinateGeneration(generationRequest(emptyKey), input, async () => empty);
assert.equal((await getMembershipUsageSnapshot(db, identity.localId)).plans.remaining, 1, "The coordinator does not consume an empty 200 result");
const generationKey = randomUUID();
await assert.rejects(coordinateGeneration(generationRequest(generationKey), input, async () => { throw new Error("TEST_PROVIDER_FAILURE"); }), /TEST_PROVIDER_FAILURE/);
assert.equal((await getMembershipUsageSnapshot(db, identity.localId)).plans.remaining, 1);
let start!: () => void; let release!: () => void;
const started = new Promise<void>((resolve) => { start = resolve; });
const barrier = new Promise<void>((resolve) => { release = resolve; });
const complete: RecommendationResult = { ...empty, nearby: { city: "Lagos", area: "Lekki", country: "Nigeria", places: [{ id: "TEST_LIVE_VENUE", name: "TEST_VENUE", address: "TEST_ADDRESS", category: "Art gallery", distanceKm: 1, reason: "TEST_REASON", mapsUrl: "https://www.google.com/maps/search/TEST", attributions: [] }] } };
const running = coordinateGeneration(generationRequest(generationKey), input, async () => { start(); await barrier; return complete; });
await started;
const pending = await coordinateGeneration(generationRequest(generationKey), input, async () => { throw new Error("DUPLICATE_GENERATION"); });
assert.equal(pending.status, 202);
release(); assert.equal((await running).status, 200);
assert.equal((await getMembershipUsageSnapshot(db, identity.localId)).plans.used, 1);
await db.collection("users").doc(identity.localId).collection("generationRequests").doc(savedDocumentId(generationKey)).update({ expiresAt: Timestamp.fromMillis(0) });
await assert.rejects(coordinateGeneration(generationRequest(generationKey), input, async () => { throw new Error("CONSUMED_GENERATION_RERAN"); }), isStatus(409));
assert.equal((await getMembershipUsageSnapshot(db, identity.localId)).plans.used, 1);

const upstreamFetch = globalThis.fetch;
const testEmail = `recurring-${randomUUID()}@example.test`;
const auth = getAuth(getFirebaseAdmin());
const subscriber = await auth.createUser({ email: testEmail, password: "emulator-only-password", emailVerified: true });
const memberRef = db.collection("users").doc(subscriber.uid);
const member = memberRef.collection("membership").doc("current");
const scheduleRef = memberRef.collection("recurringDateNights").doc("current");
const wishlistRef = db.collection("sharedWishlists").doc(deletionKey(subscriber.uid));
const mapsVenue = { id: "TEST_RECURRING_WISHLIST", displayName: { text: "Fixture gallery" }, formattedAddress: "Fixture address",
  primaryTypeDisplayName: { text: "Art gallery" }, businessStatus: "OPERATIONAL", location: { latitude: 6.45, longitude: 3.46 },
  types: ["art_gallery"], rating: 4.5, attributions: [], photos: [], timeZone: { id: "Africa/Lagos" } };
const mail: { to: string[]; html: string }[] = [];
let placesSearches = 0;
process.env.CRON_SECRET = "recurring-scheduler-test-only";
process.env.RESEND_API_KEY = "recurring-mail-fixture";
process.env.GOOGLE_MAPS_SERVER_KEY = "recurring-maps-fixture";
process.env.DATE_ATLAS_BILLING_ORIGIN = "https://adal-membership-test.vercel.app";
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://api.resend.com/emails") {
    mail.push(z.object({ to: z.array(z.email()), html: z.string() }).parse(JSON.parse(String(init?.body))));
    return Response.json({ id: "recurring-email-fixture" });
  }
  if (url.startsWith("https://maps.googleapis.com/maps/api/geocode/json")) {
    return Response.json({ status: "OK", results: [{ geometry: { location: { lat: 6.45, lng: 3.46 } }, address_components: [] }] });
  }
  if (url.startsWith("https://places.googleapis.com/v1/places:")) {
    placesSearches++;
    return Response.json({ places: [{ ...mapsVenue, id: "TEST_RECURRING_NEARBY" }] });
  }
  if (url.startsWith("https://places.googleapis.com/v1/places/")) return Response.json(mapsVenue);
  return upstreamFetch(input, init);
};
const recurringResponse = z.object({ schedule: recurringDateScheduleSchema.nullable() });
const scheduler = (token = "recurring-scheduler-test-only") => dispatch(new Request("http://localhost/recurring/dispatch", { method: "POST", headers: { Authorization: `Bearer ${token}` } }));
let publicInviteId: string | undefined;
try {
  const login = await upstreamFetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-only-key`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "emulator-only-password", returnSecureToken: true }),
  });
  assert.equal(login.status, 200);
  const { idToken } = z.object({ idToken: z.string() }).parse(await login.json());
  const action = (body: object, token = idToken) => new Request("http://localhost/membership/recurring", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  const firstDate = addCalendarDays(zonedNow("Africa/Lagos").date, 1);
  const settings = { city: "Lagos", area: "Lekki", country: "Nigeria", firstDate, startTime: "19:00", budget: 50000, vibe: "Creative", cadence: "weekly" };
  assert.equal((await recurring(action({ action: "save", settings }, identity.idToken))).status, 401);
  assert.equal((await recurring(action({ action: "save", settings }))).status, 403);
  const end = Date.now() + 86400000 * 30;
  await member.set({ provider: "paystack", subscriptionId: "RECURRING_TEST", customerId: "RECURRING_CUSTOMER", status: "active",
    paidPeriodStart: Date.now() - 60000, paidPeriodEnd: end, cancelAtPeriodEnd: false, updatedAt: Date.now() });
  await wishlistRef.set({ entries: [{ city: "Lagos", country: "Nigeria", placeId: mapsVenue.id }] });
  const created = await recurring(action({ action: "save", settings }));
  assert.equal(created.status, 200, await created.clone().text());
  assert.equal(recurringResponse.parse(await created.json()).schedule?.nextDate, firstDate);
  assert.equal((await scheduler("wrong-secret")).status, 401);
  const scheduled = await Promise.all([scheduler(), scheduler()]);
  assert.ok(scheduled.some(response => response.status === 200), (await Promise.all(scheduled.map(response => response.text()))).join("\n"));
  assert.equal(placesSearches, 0, "Eligible wishlist venues take priority over nearby search");
  const jobs = await memberRef.collection("emailNotifications").get();
  assert.equal(mail.length, 1, `Concurrent dispatches produce a single delivery: ${JSON.stringify(jobs.docs.map(job => ({ status: job.get("status"), reason: job.get("reason") })))}`);
  assert.deepEqual(mail[0].to, [testEmail]);
  assert.match(mail[0].html, /https:\/\/adal-membership-test\.vercel\.app\/membership#recurring-date-night/);
  assert.equal((await scheduleRef.get()).get("nextDate"), addCalendarDays(firstDate, 7));
  assert.deepEqual(recurringResponse.parse(await (await recurring(action({ action: "read" }))).json()).schedule?.latest, { date: firstDate, hasVenue: true });
  const reviewed = await recurring(action({ action: "review" }));
  assert.equal(reviewed.status, 200);
  const { reference } = z.object({ reference: z.object({ sessionId: z.uuid(), placeId: z.string() }) }).parse(await reviewed.json());
  assert.equal(reference.placeId, mapsVenue.id);
  assert.equal((await openDate(action(reference, identity.idToken))).status, 410, "Another account can't open a subscriber's review");
  const opened = await openDate(action(reference));
  assert.equal(opened.status, 200, await opened.clone().text());
  assert.equal((await opened.json()).request.budget, 50000);
  const invitation = await invitations(action({ action: "create", ...reference }));
  assert.equal(invitation.status, 200, await invitation.clone().text());
  const invited = z.object({ token: z.string() }).parse(await invitation.json());
  publicInviteId = (await db.collection("dateInvitations").where("token", "==", invited.token).limit(1).get()).docs[0]?.id;
  assert.ok(publicInviteId, "The recurring idea can use the existing Plan Together invitation");
  const reroll = await recurring(action({ action: "review", usePreferences: true }));
  assert.equal(reroll.status, 200);
  assert.equal((await reroll.json()).reference, null);

  await member.update({ status: "revoked" });
  assert.equal((await recurring(action({ action: "review" }))).status, 403);
  await scheduleRef.update({ dueAt: Date.now() - 1 });
  assert.equal((await scheduler()).status, 200);
  assert.equal(mail.length, 1, "Revoked Plus cannot deliver another date night");
  await member.update({ status: "active" });
  const laterDate = addCalendarDays(firstDate, 1);
  assert.equal((await recurring(action({ action: "save", settings: { ...settings, firstDate: laterDate } }))).status, 200);
  await scheduleRef.update({ dueAt: Date.now() - 1 });
  delete process.env.RESEND_API_KEY;
  assert.equal((await scheduler()).status, 200);
  assert.deepEqual(recurringResponse.parse(await (await recurring(action({ action: "read" }))).json()).schedule?.latest, { date: laterDate, hasVenue: true });
  assert.equal((await recurring(action({ action: "stop" }))).status, 200);
  assert.equal((await scheduleRef.get()).exists, false);
  process.env.RESEND_API_KEY = "recurring-mail-fixture";
  assert.equal((await scheduler()).status, 200);
  assert.equal(mail.length, 1, "Stopping recurring dates prevents future mail");
} finally {
  globalThis.fetch = upstreamFetch;
  await Promise.all([
    db.recursiveDelete(memberRef), wishlistRef.delete(), auth.deleteUser(subscriber.uid),
    publicInviteId ? db.collection("dateInvitations").doc(publicInviteId).delete() : Promise.resolve(),
  ]);
}
process.env.DATE_ATLAS_BILLING_MODE = "off";
await requireOwnedActivities(new Request("http://localhost/test"), undefined, ["LEGACY_PLAN"]);
console.log("Membership checks passed: quota boundaries, cancellation, guest transfer, recurring suggestions, email deduplication, revocation, and Plan Together.");
