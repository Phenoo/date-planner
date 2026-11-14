import "server-only";
import { resolvePlanningTimeZone } from "@/lib/maps/resolve-time-zone";
import { requestForPlace } from "@/lib/planner/timing";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { RequestError } from "@/lib/planner/http";
import { datePreferencesSchema, type historyInputSchema } from "@/lib/planner/invitations";
import { requestSchema, type PlanRequest } from "@/lib/planner/schema";
import { calendarDay, scheduleError } from "@/lib/planner/schedule";
import { calendarInstant } from "@/lib/planner/calendar";
import { getCatalog } from "@/lib/planner/catalog";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { encodeRecipe } from "@/lib/planner/money";
import { toRecipe } from "@/lib/planner/saved";
import { savedDocumentId } from "@/lib/firebase/paths";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { hasQualifyingGoogleRating } from "@/lib/maps/recommendation-quality";
import { planningOrigin } from "@/lib/maps/google";
import { mapNearbyPlaces } from "@/lib/maps/nearby";
import { fallbackDateStory } from "@/lib/planner/date-story";
import { storedDateSchema, publicStoredDateSchema, tokenKey, type StoredDate } from "./date-invitations";
import { planHasQualifyingGoogleRatings } from "./plan-ratings";
import { manageDateBackup } from "./date-backup";

async function validatePlace(record: StoredDate, request: PlanRequest) {
  const invalid = scheduleError(request);
  if (invalid) throw new RequestError(invalid, 400);
  if (record.source === "catalog") {
    const catalog = await getCatalog();
    const experience = catalog.find((item) => item.id === record.placeId && !item.demo);
    const plan = experience ? recalculateExactPlan(request, [experience], undefined, catalog, await planningOrigin(request)) : null;
    if (!plan) throw new RequestError("This place no longer fits the updated location, schedule, spending limit or requirements. Adjust those details or find another recommendation.", 409);
    if (!await planHasQualifyingGoogleRatings(plan)) throw new RequestError("This place no longer has a confirmed Google rating above 3.75. Find another recommendation before updating or sharing this date.", 409);
    return { story: fallbackDateStory(plan.activities[0].experience.category), recipe: toRecipe(plan), preferences: plan.request };
  }
  const details = await loadPlaceDetails(record.placeId, false);
  if (!hasQualifyingGoogleRating(details.record.rating)) throw new RequestError("This place no longer has a confirmed Google rating above 3.75. Find another recommendation before updating or sharing this date.", 409);
  const origin = await planningOrigin(request);
  if (!origin) throw new RequestError("The updated location couldn't be checked. Please retry before saving these changes.", 503);
  const matches = mapNearbyPlaces({ places: [details.record] }, origin, request, 1);
  if (!matches.places.length) throw new RequestError("This place doesn't fit the updated destination, schedule or required preferences. Adjust your details or find another place.", 409);
  return { story: fallbackDateStory(details.place.category), recipe: null, preferences: requestForPlace(request, matches.places[0]) };
}

type DateManagementInput = Exclude<z.infer<typeof historyInputSchema>, { action: "list" | "complete" }>;

export async function manageDate(request: Request, input: DateManagementInput) {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to manage your dates.", 401);
  const user = auth.db.collection("users").doc(auth.user.uid);
  const ref = user.collection("dateHistory").doc(input.id);
  const snapshot = await ref.get();
  if (!snapshot.exists && input.action === "delete") return { deleted: true };
  const parsed = storedDateSchema.safeParse(snapshot.data());
  if (!parsed.success) throw new RequestError("This date wasn't found in your account.", 404);
  const record = parsed.data;
  if (input.action === "read-backup" || input.action === "suggest-backup" || input.action === "save-backup" || input.action === "remove-backup") {
    return manageDateBackup(request.signal, auth.db, snapshot, record, input);
  }
  if (input.action === "context") {
    const preferences = requestSchema.safeParse(record.planningRequest);
    if (!preferences.success) throw new RequestError("This older date doesn't have enough saved preferences to revalidate an edit. Keep this memory and plan a new date with your chosen details.", 409);
    return { request: preferences.data };
  }
  const revision = input.action === "revise-invitation" ? input : null;
  const revisedFromInvitationKey = revision ? tokenKey(revision.token) : null;
  if (revision) {
    if (record.dateStatus !== "planned") throw new RequestError("This date has already been marked as done.", 409);
    if (record.revisedFromInvitationKey === revisedFromInvitationKey && record.invitationPublished && !record.invitationRevoked && record.date === revision.date && record.startTime === revision.startTime) {
      return { id: input.id, token: record.token, response: record.response };
    }
    if (record.token !== revision.token || !record.suggestedTime) throw new RequestError("This invitation changed. Refresh My dates to open the latest invitation.", 409);
  }
  const inputRequest = input.action === "revise-invitation"
    ? record.planningRequest && { ...record.planningRequest, date: input.date, startTime: input.startTime, endTime: "", timeZone: record.timeZone, timeZoneConfirmed: true }
    : input.action === "update" ? input.request : record.planningRequest;
  const revalidate = input.action === "update" || input.action === "publish" || revision !== null;
  let preferences = inputRequest ? { ...inputRequest, datePreference: [0, 6].includes(calendarDay(inputRequest.date)) ? "weekend" as const : "weekday" as const } : undefined;
  if (preferences && revalidate) preferences = await resolvePlanningTimeZone(preferences);
  if (revision && preferences) {
    try { calendarInstant(preferences.date, preferences.startTime, preferences.timeZone); }
    catch { throw new RequestError("Choose a valid local time.", 400); }
  }
  const changes = revalidate && preferences ? await validatePlace(record, preferences) : null;
  if (revalidate && !changes) throw new RequestError("This older date needs its preferences reviewed in the planner first.", 409);
  if (changes) preferences = changes.preferences;
  const token = randomBytes(24).toString("base64url");
  return auth.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists && input.action === "delete") return { deleted: true };
    if (!snapshot.updateTime || !current.updateTime?.isEqual(snapshot.updateTime)) throw new RequestError("This date changed while you were editing. Refresh it and try again.", 409);
    if (input.action === "delete") {
      if (record.invitationPublished && !record.invitationRevoked) tx.delete(auth.db.collection("dateInvitations").doc(record.invitationKey));
      if (record.savedRecipeId) tx.delete(user.collection("savedPlans").doc(savedDocumentId(record.savedRecipeId)));
      tx.delete(user.collection("userFeedback").doc(input.id));
      tx.delete(ref); return { deleted: true };
    }
    if (input.action === "rename") { tx.update(ref, { customTitle: input.title, updatedAt: Timestamp.now() }); return { saved: true }; }
    if (record.dateStatus === "completed") throw new RequestError("Keep completed dates as memories. Plan a new date to change the schedule.", 409);
    if ((input.action === "update" || revision) && preferences && changes) {
      if (record.invitationPublished && !record.invitationRevoked) tx.delete(auth.db.collection("dateInvitations").doc(record.invitationKey));
      const updated = { ...datePreferencesSchema.parse(preferences), story: changes.story, response: "pending" as const, invitationPublished: !!revision, invitationRevoked: !revision };
      const replacement = revision ? { token, invitationKey: tokenKey(token) } : null;
      tx.update(ref, {
        ...updated, ...replacement, planningRequest: preferences, updatedAt: Timestamp.now(),
        suggestedTime: FieldValue.delete(), suggestedVibe: FieldValue.delete(),
        revisedFromInvitationKey: revisedFromInvitationKey ?? FieldValue.delete(),
        ...(record.backupPlaceId && record.planningRequest && !isDeepStrictEqual(record.planningRequest, preferences) ? { backupPlaceId: FieldValue.delete() } : {}),
        ...(changes.recipe ? { savedRecipeId: changes.recipe.id } : {}),
      });
      if (changes.recipe) {
        if (record.savedRecipeId && record.savedRecipeId !== changes.recipe.id) tx.delete(user.collection("savedPlans").doc(savedDocumentId(record.savedRecipeId)));
        tx.set(user.collection("savedPlans").doc(savedDocumentId(changes.recipe.id)), { recipe: encodeRecipe(changes.recipe), updatedAt: Timestamp.now() });
      }
      if (!replacement) return { saved: true, invitationRevoked: record.invitationPublished };
      tx.create(auth.db.collection("dateInvitations").doc(replacement.invitationKey), {
        ...publicStoredDateSchema.parse({ ...record, ...updated, ...replacement }),
        publicStoryVersion: 1, ownerId: auth.user.uid, selectionId: input.id,
      });
      return { id: input.id, token, response: updated.response };
    }
    if (input.action === "publish" && changes) {
      if (record.invitationPublished && !record.invitationRevoked) return { id: input.id, token: record.token, response: record.response };
      const next = { ...record, token, invitationKey: tokenKey(token), invitationPublished: true, invitationRevoked: false, response: "pending" as const };
      tx.update(ref, { token: next.token, invitationKey: next.invitationKey, invitationPublished: true, invitationRevoked: false, response: next.response, suggestedTime: FieldValue.delete(), suggestedVibe: FieldValue.delete(), revisedFromInvitationKey: FieldValue.delete(), updatedAt: Timestamp.now() });
      tx.create(auth.db.collection("dateInvitations").doc(next.invitationKey), { ...publicStoredDateSchema.parse(next), story: changes.story, publicStoryVersion: 1, ownerId: auth.user.uid, selectionId: input.id });
      return { id: input.id, token, response: next.response };
    }
    throw new RequestError("Choose a supported date action.", 400);
  });
}
