import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getDatabase } from "../../lib/firebase/server";
import { persistDiscoverySession } from "../../lib/server/date-invitations";
import { invitations } from "../../lib/server/actions/invitations";
import { dateHistory } from "../../lib/server/actions/date-history";
import { POST as mergeGuest } from "../../app/api/account/merge/route";
import { requestSchema } from "../../lib/planner/schema";
import { createdInvitationSchema, publicInvitationSchema, dateHistoryResponseSchema } from "../../lib/planner/invitations";
import { fallbackDateStory } from "../../lib/planner/date-story";
import type { NearbyResult } from "../../lib/maps/schema";

if (process.env.FIREBASE_PROJECT_ID !== "demo-date-atlas" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("This check only runs against the local demo emulators.");

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://places.googleapis.com/v1/places/")) {
    const id = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
    return Response.json({ id, displayName: { text: `TEST FIXTURE ${id}` }, formattedAddress: "TEST FIXTURE ADDRESS", primaryTypeDisplayName: { text: "Art gallery" }, businessStatus: "OPERATIONAL", location: { latitude: 6.45, longitude: 3.46 }, types: ["art_gallery"], attributions: [], photos: [] });
  }
  return originalFetch(input, init);
};
const authResult = z.object({ idToken: z.string(), localId: z.string() });
async function user(email?: string) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-only-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true, ...(email ? { email, password: "Emulator-only-Password-728!" } : {}) }) });
  assert.equal(response.status, 200); return authResult.parse(await response.json());
}
let requestNumber = 0;
function req(body: unknown, token?: string) {
  return new Request("http://test.local/api", { method: "POST", headers: { "Content-Type": "application/json", "x-atlas-client-ip": `test-${++requestNumber}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
const guest = await user();
const memberEmail = `journey-${randomUUID()}@example.test`;
const member = await user(memberEmail);
const stranger = await user(`stranger-${randomUUID()}@example.test`);
const preferences = requestSchema.parse({ city: "Lagos", area: "Lekki", country: "Nigeria", occasion: "Romantic date", budget: null, vibes: ["Creative"], datePreference: "weekend", duration: 180, notes: "PRIVATE TEST NOTES" });
const choices: NearbyResult = { city: "Lagos", area: "Lekki", country: "Nigeria", places: Array.from({ length: 3 }, (_, index) => ({ id: `TEST_PLACE_${index}`, name: `TEST FIXTURE ${index}`, category: "Art gallery", address: "TEST FIXTURE ADDRESS", distanceKm: 1, reason: "Test only", mapsUrl: "https://www.google.com/maps/", attributions: [], story: fallbackDateStory("Art gallery") })) };
const session = await persistDiscoverySession(req({}, guest.idToken), choices, preferences);
assert.ok(session.sessionId);
const db = getDatabase();
const storedSession = (await db.collection("users").doc(guest.localId).collection("discoverySessions").doc(session.sessionId).get()).data()!;
for (const key of ["notes", "budget", "startingArea", "interests", "date"]) assert.equal(key in storedSession, false);

const create = { action: "create", sessionId: session.sessionId, placeId: choices.places[0].id };
assert.equal((await invitations(req(create))).status, 401);
assert.equal((await invitations(req(create, stranger.idToken))).status, 404);
assert.equal((await invitations(req({ ...create, placeId: "NOT_A_CANDIDATE" }, guest.idToken))).status, 400);
const created = await Promise.all([invitations(req(create, guest.idToken)), invitations(req(create, guest.idToken))]);
for (const response of created) assert.equal(response.status, 200);
const first = createdInvitationSchema.parse(await created[0].json());
const duplicate = createdInvitationSchema.parse(await created[1].json());
assert.deepEqual(first, duplicate);
assert.equal((await db.collection("users").doc(guest.localId).collection("dateHistory").get()).size, 1);

const publicResponse = await invitations(req({ action: "read", token: first.token }));
assert.equal(publicResponse.status, 200);
const raw: unknown = await publicResponse.json();
const publicDate = publicInvitationSchema.parse(raw);
assert.equal(publicDate.response, "pending", "Opening a link must never accept it");
assert.equal(publicDate.startTime, "");
assert.equal(publicDate.datePreference, "weekend");
assert.equal(publicDate.place?.name, `TEST FIXTURE ${choices.places[0].id}`);
assert.ok(raw && typeof raw === "object");
for (const key of ["ownerId", "token", "selectionId", "notes", "budget", "interests"]) assert.equal(key in raw, false);

assert.equal((await dateHistory(req({ action: "list" }, guest.idToken))).status, 401);
assert.equal((await mergeGuest(req({ guestToken: guest.idToken }, member.idToken))).status, 200);
assert.equal((await mergeGuest(req({ guestToken: guest.idToken }, member.idToken))).status, 200);
assert.equal((await db.collection("users").doc(member.localId).collection("dateHistory").get()).size, 1);
const afterMerge = await invitations(req(create, member.idToken));
assert.equal(afterMerge.status, 200);
assert.deepEqual(createdInvitationSchema.parse(await afterMerge.json()), first, "Account merge must preserve the invitation and idempotency");

const accept = { action: "reply", token: first.token, response: "accepted" };
assert.equal((await invitations(req(accept))).status, 200);
const ownerHistory = db.collection("users").doc(member.localId).collection("dateHistory").doc(first.id);
const acceptedAt = (await ownerHistory.get()).data()!.respondedAt as Timestamp;
assert.equal((await ownerHistory.get()).data()!.response, "accepted", "Replies after account merge must reach the permanent account");
assert.equal((await invitations(req(accept))).status, 200);
assert.equal(((await ownerHistory.get()).data()!.respondedAt as Timestamp).toMillis(), acceptedAt.toMillis());
assert.equal((await invitations(req({ ...accept, response: "declined" }))).status, 409);
const memberHistory = dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list" }, member.idToken))).json());
assert.equal(memberHistory.dates[0].response, "accepted");
assert.equal(dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list" }, stranger.idToken))).json()).dates.length, 0);
assert.equal((await dateHistory(req({ action: "complete", id: first.id }, stranger.idToken))).status, 404);
assert.equal((await dateHistory(req({ action: "complete", id: first.id }, member.idToken))).status, 200);
assert.equal((await ownerHistory.get()).data()!.dateStatus, "completed");
assert.equal(publicInvitationSchema.parse(await (await invitations(req({ action: "read", token: first.token }))).json()).dateStatus, "completed");

const history = db.collection("users").doc(member.localId).collection("dateHistory");
const template = (await ownerHistory.get()).data()!;
for (let index = 0; index < 11; index++) await history.doc(index.toString(16).padStart(64, "0")).set({ ...template, createdAt: Timestamp.fromMillis(Date.now() + index * 1000) });
const pageOne = dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list" }, member.idToken))).json());
assert.equal(pageOne.dates.length, 10); assert.ok(pageOne.nextCursor);
const pageTwo = dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list", cursor: pageOne.nextCursor }, member.idToken))).json());
assert.equal(pageTwo.dates.length, 2); assert.equal(pageTwo.nextCursor, null);
assert.equal(new Set([...pageOne.dates, ...pageTwo.dates].map((date) => date.id)).size, 12);
assert.equal((await dateHistory(req({ action: "list", cursor: pageOne.nextCursor }, stranger.idToken))).status, 400);
await history.doc("f".repeat(64)).set({ ...template, dateStatus: "planned", story: { ...template.story, title: "TEST FIXTURE — A creative date" }, createdAt: Timestamp.fromMillis(Date.now() + 20000) });
const planned = dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list", status: "planned" }, member.idToken))).json());
assert.equal(planned.dates.length, 1);
assert.equal(planned.dates[0].dateStatus, "planned");
const completed = dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list", status: "completed" }, member.idToken))).json());
assert.ok(completed.dates.every((date) => date.dateStatus === "completed"));
assert.equal(completed.dates.length, 10);
assert.ok(completed.nextCursor);
const completedSecond = dateHistoryResponseSchema.parse(await (await dateHistory(req({ action: "list", status: "completed", cursor: completed.nextCursor }, member.idToken))).json());
assert.equal(completedSecond.dates.length, 2);
const finishedInvite = createdInvitationSchema.parse(await (await invitations(req({ ...create, placeId: choices.places[1].id }, member.idToken))).json());
assert.equal((await dateHistory(req({ action: "complete", id: finishedInvite.id }, member.idToken))).status, 200);
assert.equal((await invitations(req({ action: "reply", token: finishedInvite.token, response: "accepted" }))).status, 409);
await writeFile(".vercel/emulator-journey-member.json", JSON.stringify({ email: memberEmail, password: "Emulator-only-Password-728!" }), { mode: 0o600 });
console.log("Date journey emulator checks passed: private sessions, three candidates, concurrent selection, guest/account merge, public invitation, explicit and idempotent replies, account isolation, completed dates, and pagination.");
await db.terminate();
