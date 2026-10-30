import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { datePreferencesSchema, invitationPlaceSchema, invitationResponseSchema, invitationTokenSchema, selectionIdSchema, suggestedTimeSchema, type ChosenDate, type PublicInvitation } from "@/lib/planner/invitations";
import { dateStorySchema, fallbackDateStory } from "@/lib/planner/date-story";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { RequestError } from "@/lib/planner/http";
import type { NearbyResult } from "@/lib/maps/schema";
import { requestSchema } from "@/lib/planner/schema";
import { fitsVenueRequest } from "@/lib/maps/venue-facts";
import type { PlanRequest } from "@/lib/planner/schema";
import { getCatalog } from "@/lib/planner/catalog";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { toRecipe, type SavedRecipe } from "@/lib/planner/saved";
import { encodeRecipe } from "@/lib/planner/money";
import { savedDocumentId } from "@/lib/firebase/paths";
import { scheduleError } from "@/lib/planner/schedule";
import { venueControls } from "./venue-controls";
import { deletionKey } from "./account-privacy";
import { contextExpired } from "./context-retention";

const sessionSchema = datePreferencesSchema.extend({ candidates: z.array(z.object({ id: z.string().min(1).max(200), distanceKm: z.number().nonnegative().default(0), story: dateStorySchema })).min(1).max(3) });
export const storedDateSchema = datePreferencesSchema.extend({
  token: invitationTokenSchema, invitationKey: selectionIdSchema, placeId: z.string().min(1).max(200),
  story: dateStorySchema, response: invitationResponseSchema, dateStatus: z.enum(["planned", "completed"]), createdAt: z.instanceof(Timestamp),
  invitationRevoked: z.boolean().default(false),
  invitationPublished: z.boolean().default(true),
  source: z.enum(["google", "catalog"]).default("google"),
  publicStoryVersion: z.literal(1).optional(),
  planningRequest: requestSchema.optional(), customTitle: z.string().max(100).optional(), savedRecipeId: z.string().max(500).optional(),
  suggestedTime: suggestedTimeSchema.optional(),
});
export type StoredDate = z.infer<typeof storedDateSchema>;
export const publicStoredDateSchema = storedDateSchema.omit({ planningRequest: true, customTitle: true, savedRecipeId: true });
export const tokenKey = (token: string) => createHash("sha256").update(token).digest("hex");
export const dateSelectionId = (sessionId: string, placeId: string) => createHash("sha256").update(`${sessionId}:${placeId}`).digest("hex");

export async function persistDiscoverySession(request: Request, result: NearbyResult, preferences: PlanRequest) {
  if (!result.places.length || process.env.DATE_ATLAS_CATALOG_MODE === "demo") return result;
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Your planning session expired. Please generate your ideas again.", 401);
  const sessionId = randomUUID();
  const data = sessionSchema.parse({ ...preferences, candidates: result.places.slice(0, 3).map((place) => ({ id: place.id, distanceKm: place.distanceKm, story: place.story ?? fallbackDateStory(place.category) })) });
  await auth.db.collection("users").doc(auth.user.uid).collection("discoverySessions").doc(sessionId).set({ ...data, privateRequest: requestSchema.parse(preferences), createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
  return { ...result, sessionId };
}

export async function createChosenDate(request: Request, sessionId: string, placeId: string, publish = true) {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Create an account or sign in to save or share your date.", 401);
  const user = auth.db.collection("users").doc(auth.user.uid);
  const sessionRecord = (await user.collection("discoverySessions").doc(sessionId).get()).data();
  const session = sessionSchema.safeParse(sessionRecord);
  if (sessionRecord && contextExpired(sessionRecord)) throw new RequestError("Your planning session expired. Reopen your saved date or plan again.", 410);
  if (!session.success) throw new RequestError("Reopen your date ideas to choose this place.", 404);
  const candidate = session.data.candidates.find((place) => place.id === placeId);
  if (!candidate) throw new RequestError("Choose a place from your recommendations.", 400);
  const id = dateSelectionId(sessionId, placeId);
  const history = user.collection("dateHistory").doc(id);
  const existing = storedDateSchema.safeParse((await history.get()).data());
  if (existing.success && (!publish || existing.data.invitationPublished && !existing.data.invitationRevoked)) return { token: existing.data.token, id, response: existing.data.response };
  if (existing.success && existing.data.dateStatus === "completed") throw new RequestError("This date is already marked as done. Plan another date to create a new invitation.", 409);
  const details = await loadPlaceDetails(placeId, false);
  const privateRequest = requestSchema.safeParse(sessionRecord?.privateRequest);
  if (privateRequest.success) {
    const issue = scheduleError(privateRequest.data);
    if (issue) throw new RequestError(issue, 400);
    if (!fitsVenueRequest(details.record, privateRequest.data, candidate.distanceKm)) throw new RequestError("The venue no longer fits your schedule or required restrictions. Adjust your date before saving or sharing.", 409);
  }
  if (!details.operational) throw new RequestError("This place is no longer open. Please choose another idea.", 409);
  const token = randomBytes(24).toString("base64url");
  const invitationKey = tokenKey(token);
  const { candidates: _candidates, ...preferences } = session.data;
  void _candidates;
  const record: StoredDate = { ...preferences, ...(privateRequest.success ? { planningRequest: privateRequest.data } : {}), token, invitationKey, placeId, story: candidate.story, response: "pending", dateStatus: "planned", createdAt: existing.success ? existing.data.createdAt : Timestamp.now(), invitationRevoked: false, invitationPublished: publish, source: "google" };
  return auth.db.runTransaction(async (tx) => {
    const current = storedDateSchema.safeParse((await tx.get(history)).data());
    if (current.success && (!publish || current.data.invitationPublished && !current.data.invitationRevoked)) return { token: current.data.token, id, response: current.data.response };
    if (current.success && current.data.dateStatus === "completed") throw new RequestError("This date is already marked as done.", 409);
    tx.set(history, record);
    if (publish) tx.create(auth.db.collection("dateInvitations").doc(invitationKey), { ...publicStoredDateSchema.parse(record), story: fallbackDateStory(details.place.category), publicStoryVersion: 1, ownerId: auth.user.uid, selectionId: id });
    return { token, id, response: record.response };
  });
}

export async function createCatalogInvitation(request: Request, recipe: SavedRecipe) {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Create an account or sign in to share your date.", 401);
  const issue = scheduleError(recipe.request);
  if (issue) throw new RequestError(issue, 400);
  const catalog = await getCatalog();
  const experiences = recipe.experienceIds.map((id) => catalog.find((item) => item.id === id));
  const plan = experiences.every((item) => item !== undefined) ? recalculateExactPlan(recipe.request, experiences, undefined, catalog) : null;
  if (!plan) throw new RequestError("This date no longer fits the catalog, schedule or budget. Adjust your plan before sharing.", 409);
  if (plan.demo) throw new RequestError("Demonstration plans use fictional venues and cannot create real invitations.", 422);
  const id = dateSelectionId("catalog", plan.id);
  const user = auth.db.collection("users").doc(auth.user.uid);
  const history = user.collection("dateHistory").doc(id);
  const token = randomBytes(24).toString("base64url");
  const invitationKey = tokenKey(token);
  const record: StoredDate = {
    ...datePreferencesSchema.parse(plan.request), source: "catalog", token, invitationKey,
    placeId: plan.activities[0].experience.id, story: fallbackDateStory(plan.activities[0].experience.category),
    planningRequest: plan.request, savedRecipeId: plan.id,
    response: "pending", dateStatus: "planned", createdAt: Timestamp.now(), invitationPublished: true, invitationRevoked: false,
  };
  return auth.db.runTransaction(async (tx) => {
    const current = storedDateSchema.safeParse((await tx.get(history)).data());
    if (current.success && !current.data.invitationRevoked) return { id, token: current.data.token, response: current.data.response };
    if (current.success && current.data.dateStatus === "completed") throw new RequestError("This date is already marked as done.", 409);
    if (current.success) record.createdAt = current.data.createdAt;
    tx.set(history, record);
    tx.set(user.collection("savedPlans").doc(savedDocumentId(plan.id)), { recipe: encodeRecipe(toRecipe(plan)), updatedAt: FieldValue.serverTimestamp() });
    tx.create(auth.db.collection("dateInvitations").doc(invitationKey), { ...publicStoredDateSchema.parse(record), publicStoryVersion: 1, ownerId: auth.user.uid, selectionId: id });
    return { id, token, response: record.response };
  });
}

export async function readChosenSelection(request: Request, sessionId: string, placeId: string) {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to manage your invitation.", 401);
  const id = dateSelectionId(sessionId, placeId);
  const record = storedDateSchema.safeParse((await auth.db.collection("users").doc(auth.user.uid).collection("dateHistory").doc(id).get()).data());
  return { saved: record.success, selection: record.success && record.data.invitationPublished && !record.data.invitationRevoked ? { id, token: record.data.token, response: record.data.response } : null };
}

export async function revokeDateInvitation(request: Request, id: string) {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to revoke your invitation.", 401);
  const ref = auth.db.collection("users").doc(auth.user.uid).collection("dateHistory").doc(id);
  await auth.db.runTransaction(async (tx) => {
    const record = storedDateSchema.safeParse((await tx.get(ref)).data());
    if (!record.success) throw new RequestError("This invitation couldn't be found in your account.", 404);
    if (record.data.invitationRevoked || !record.data.invitationPublished) return;
    tx.delete(auth.db.collection("dateInvitations").doc(record.data.invitationKey));
    tx.update(ref, { invitationRevoked: true });
  });
  return { revoked: true };
}

export async function hydrateDate(record: StoredDate, withPhoto = true): Promise<PublicInvitation> {
  let place: PublicInvitation["place"] = null;
  if (record.source === "catalog") {
    const catalog = await getCatalog().catch(() => []);
    const experience = catalog.find((item) => item.id === record.placeId && !item.demo);
    if (experience) {
      const photo = z.url({ protocol: /^https$/ }).safeParse(experience.image);
      place = invitationPlaceSchema.parse({ id: experience.id, name: experience.venue, category: experience.category, address: `${experience.area}, ${experience.city}, ${experience.country}`, mapsUrl: `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${experience.lat},${experience.lng}` })}`, attributions: [], ...(withPhoto && photo.success ? { photo: { url: photo.data, authors: [] } } : {}) });
    }
  } else place = (await loadPlaceDetails(record.placeId, withPhoto).catch(() => null))?.place ?? null;
  return {
    date: record.date, duration: record.duration, datePreference: record.datePreference, startTime: record.startTime, timeZone: record.timeZone, city: record.city, country: record.country,
    placeId: record.placeId, place, source: record.source, story: record.story, response: record.response,
    dateStatus: record.dateStatus, createdAt: record.createdAt.toDate().toISOString(), ...(record.suggestedTime ? { suggestedTime: record.suggestedTime } : {}),
  };
}

export async function readDateInvitation(token: string) {
  const row = await getDatabase().collection("dateInvitations").doc(tokenKey(token)).get();
  const record = storedDateSchema.safeParse(row.data());
  if (!record.success) throw new RequestError("This invitation couldn't be found. Ask for a new link.", 404);
  const ownerId: unknown = row.data()?.ownerId;
  if (typeof ownerId === "string") {
    const deletion = (await getDatabase().collection("accountDeletionRequests").doc(deletionKey(ownerId)).get()).data();
    if (deletion?.status === "processing" || deletion?.status === "complete") throw new RequestError("This invitation is no longer available.", 404);
  }
  if ((await venueControls()).has(record.data.placeId)) throw new RequestError("This place is under review. Ask the creator to adjust the date.", 410);
  const invitation = await hydrateDate(record.data);
  return record.data.publicStoryVersion === 1 ? invitation : { ...invitation, story: fallbackDateStory(invitation.place?.category ?? "Date experience") };
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
    return { ...await hydrateDate(record.data, false), id: row.id, token: record.data.token, invitationRevoked: record.data.invitationRevoked, invitationPublished: record.data.invitationPublished, ...(record.data.customTitle ? { title: record.data.customTitle } : {}), canEdit: Boolean(record.data.planningRequest) };
  }));
  return { dates: dates.filter((date) => date !== null), nextCursor: rows.docs.length > 10 ? rows.docs[9].id : null };
}
