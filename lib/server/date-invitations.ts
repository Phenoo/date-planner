import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { datePreferencesSchema, invitationResponseSchema, invitationTokenSchema, selectionIdSchema, type ChosenDate, type PublicInvitation } from "@/lib/planner/invitations";
import { dateStorySchema, fallbackDateStory } from "@/lib/planner/date-story";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { RequestError } from "@/lib/planner/http";
import type { NearbyResult } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";

const sessionSchema = datePreferencesSchema.extend({ candidates: z.array(z.object({ id: z.string().min(1).max(200), story: dateStorySchema })).min(1).max(3) });
export const storedDateSchema = datePreferencesSchema.extend({
  token: invitationTokenSchema, invitationKey: selectionIdSchema, placeId: z.string().min(1).max(200),
  story: dateStorySchema, response: invitationResponseSchema, dateStatus: z.enum(["planned", "completed"]), createdAt: z.instanceof(Timestamp),
});
export type StoredDate = z.infer<typeof storedDateSchema>;
export const tokenKey = (token: string) => createHash("sha256").update(token).digest("hex");
export const dateSelectionId = (sessionId: string, placeId: string) => createHash("sha256").update(`${sessionId}:${placeId}`).digest("hex");

export async function persistDiscoverySession(request: Request, result: NearbyResult, preferences: PlanRequest) {
  if (!result.places.length || process.env.DATE_ATLAS_CATALOG_MODE === "demo") return result;
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Your planning session expired. Please generate your ideas again.", 401);
  const sessionId = randomUUID();
  const data = sessionSchema.parse({ ...preferences, candidates: result.places.slice(0, 3).map((place) => ({ id: place.id, story: place.story ?? fallbackDateStory(place.category) })) });
  await auth.db.collection("users").doc(auth.user.uid).collection("discoverySessions").doc(sessionId).set({ ...data, createdAt: Timestamp.now() });
  return { ...result, sessionId };
}

export async function createChosenDate(request: Request, sessionId: string, placeId: string) {
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Please reopen your date ideas to pick a place.", 401);
  const user = auth.db.collection("users").doc(auth.user.uid);
  const session = sessionSchema.safeParse((await user.collection("discoverySessions").doc(sessionId).get()).data());
  if (!session.success) throw new RequestError("Reopen your date ideas to choose this place.", 404);
  const candidate = session.data.candidates.find((place) => place.id === placeId);
  if (!candidate) throw new RequestError("Choose a place from your recommendations.", 400);
  const id = dateSelectionId(sessionId, placeId);
  const history = user.collection("dateHistory").doc(id);
  const existing = storedDateSchema.safeParse((await history.get()).data());
  if (existing.success) return { token: existing.data.token, id, response: existing.data.response };
  const details = await loadPlaceDetails(placeId, false);
  if (!details.operational) throw new RequestError("This place is no longer open. Please choose another idea.", 409);
  const token = randomBytes(24).toString("base64url");
  const invitationKey = tokenKey(token);
  const { candidates: _candidates, ...preferences } = session.data;
  void _candidates;
  const record: StoredDate = { ...preferences, token, invitationKey, placeId, story: candidate.story, response: "pending", dateStatus: "planned", createdAt: Timestamp.now() };
  return auth.db.runTransaction(async (tx) => {
    const current = storedDateSchema.safeParse((await tx.get(history)).data());
    if (current.success) return { token: current.data.token, id, response: current.data.response };
    tx.set(history, record);
    tx.create(auth.db.collection("dateInvitations").doc(invitationKey), { ...record, ownerId: auth.user.uid, selectionId: id });
    return { token, id, response: record.response };
  });
}

export async function hydrateDate(record: StoredDate, withPhoto = true): Promise<PublicInvitation> {
  const details = await loadPlaceDetails(record.placeId, withPhoto).catch(() => null);
  return {
    datePreference: record.datePreference, startTime: record.startTime, city: record.city, country: record.country,
    placeId: record.placeId, place: details?.place ?? null, story: record.story, response: record.response,
    dateStatus: record.dateStatus, createdAt: record.createdAt.toDate().toISOString(),
  };
}

export async function readDateInvitation(token: string) {
  const row = await getDatabase().collection("dateInvitations").doc(tokenKey(token)).get();
  const record = storedDateSchema.safeParse(row.data());
  if (!record.success) throw new RequestError("This invitation couldn't be found. Ask for a new link.", 404);
  return hydrateDate(record.data);
}

export async function listChosenDates(request: Request, cursor?: string, status?: "planned" | "completed") {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to see your date history.", 401);
  const history = auth.db.collection("users").doc(auth.user.uid).collection("dateHistory");
  let query: Query = history;
  if (status) query = query.where("dateStatus", "==", status);
  query = query.orderBy("createdAt", "desc").limit(11);
  if (cursor) {
    const after = await history.doc(cursor).get();
    if (!after.exists) throw new RequestError("Refresh your date history and try again.", 400);
    query = query.startAfter(after);
  }
  const rows = await query.get();
  const dates = await Promise.all(rows.docs.slice(0, 10).map(async (row): Promise<ChosenDate | null> => {
    const record = storedDateSchema.safeParse(row.data());
    if (!record.success) return null;
    return { ...await hydrateDate(record.data, false), id: row.id, token: record.data.token };
  }));
  return { dates: dates.filter((date) => date !== null), nextCursor: rows.docs.length > 10 ? rows.docs[9].id : null };
}
