import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { planningOrigin } from "@/lib/maps/google";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { loadPlaceCandidates } from "@/lib/maps/places";
import { mapNearbyPlaces } from "@/lib/maps/nearby";
import { destinationTimeZone } from "@/lib/maps/resolve-time-zone";
import { nextRecurringDate, recurringDateInputSchema, recurringDateScheduleSchema, recurringDateSettingsSchema } from "@/lib/membership/recurring-date-night";
import { calendarInstant } from "@/lib/planner/calendar";
import { amountPrecisionError, currencyForCountry } from "@/lib/planner/currency";
import { fallbackDateStory } from "@/lib/planner/date-story";
import { datePreferencesSchema } from "@/lib/planner/invitations";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { calendarDay } from "@/lib/planner/schedule";
import { requestSchema } from "@/lib/planner/schema";
import { wishlistEntrySchema, wishlistLimit } from "@/lib/planner/shared-wishlist";
import { deletionKey } from "./account-privacy";
import { membershipTestEnabled, requireMembershipTest } from "./membership-config";
import { recurringDateCollection, recurringDateEmailId, recurringDateEntitled, recurringDateRecordSchema, type RecurringDateRecord } from "./recurring-date-state";
import { sendDateCreatedEmail } from "./date-created-email";

const reviewLifetime = 3600000;
const reply = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
const deletionStarted = (status: unknown) => status === "requested" || status === "processing" || status === "complete";

function preferences(schedule: RecurringDateRecord, date: string) {
  return requestSchema.parse({
    country: schedule.country, city: schedule.city, currentCity: schedule.city, area: schedule.area ?? schedule.city,
    locationScope: schedule.area ? "area" : "city", maxDistance: schedule.area ? 15 : 25,
    currency: currencyForCountry(schedule.country) ?? "NGN", budget: schedule.budget,
    occasion: "Romantic date", vibes: [schedule.vibe], date, startTime: schedule.startTime,
    timeZone: schedule.timeZone, timeZoneConfirmed: true, durationMode: "estimated",
    datePreference: [0, 6].includes(calendarDay(date)) ? "weekend" : "weekday",
  });
}

function summary(schedule: RecurringDateRecord | null) {
  return schedule ? recurringDateScheduleSchema.parse({
    ...schedule, latest: schedule.latest && schedule.latest.startsAt > Date.now()
      ? { date: schedule.latest.date, hasVenue: schedule.latest.place !== null } : null,
  }) : null;
}

export async function recurringDateNight(request: Request) {
  try {
    requireMembershipTest();
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to manage recurring date nights.", 401);
    const parsed = recurringDateInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Check your date-night settings and try again.", 400);
    const input = parsed.data;
    const user = auth.db.collection("users").doc(auth.user.uid);
    const ref = user.collection(recurringDateCollection).doc("current");
    const membership = user.collection("membership").doc("current");
    const deletion = auth.db.collection("accountDeletionRequests").doc(deletionKey(auth.user.uid));
    if (input.action === "read") return reply({ schedule: summary(recurringDateRecordSchema.safeParse((await ref.get()).data()).data ?? null) });
    await enforcePlannerLimit(request, "conversation");
    if (input.action === "stop") {
      await ref.delete();
      return reply({ schedule: null });
    }
    if (input.action === "review") {
      const result = await auth.db.runTransaction(async (tx) => {
        const [snapshot, member, deleted] = await tx.getAll(ref, membership, deletion);
        if (!recurringDateEntitled(member.data()) || deletionStarted(deleted.get("status"))) throw new RequestError("This date-night suggestion is unavailable.", 403);
        const schedule = recurringDateRecordSchema.safeParse(snapshot.data()).data;
        if (!schedule?.latest || schedule.latest.startsAt <= Date.now()) throw new RequestError("There’s no upcoming suggestion to review yet.", 404);
        const plan = preferences(schedule, schedule.latest.date);
        const place = schedule.latest.place;
        if (!place || input.usePreferences) return { request: plan, reference: null };
        const sessionId = randomUUID();
        const expiresAt = Math.min(Date.now() + reviewLifetime, schedule.latest.startsAt);
        tx.create(user.collection("discoverySessions").doc(sessionId), {
          ...datePreferencesSchema.parse(plan), privateRequest: plan,
          candidates: [{ ...place, story: fallbackDateStory("Date night") }],
          createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(expiresAt),
        });
        return { request: plan, reference: { sessionId, placeId: place.id, expiresAt } };
      });
      return reply(result);
    }
    if (!recurringDateEntitled((await membership.get()).data())) throw new RequestError("Recurring date nights are available with Plus.", 403);
    const { settings } = input;
    const currency = currencyForCountry(settings.country);
    if (!currency) throw new RequestError("Choose a country with a supported currency.", 400);
    const invalidBudget = amountPrecisionError(settings.budget, currency);
    if (invalidBudget) throw new RequestError(invalidBudget, 400);
    const timeZone = await destinationTimeZone(settings.city, settings.country);
    if (!timeZone) throw new RequestError("We couldn’t confirm this destination. Check the city and country.", 422);
    const now = Date.now();
    let first: Date;
    try { first = calendarInstant(settings.firstDate, settings.startTime, timeZone); }
    catch { throw new RequestError("Choose a time that exists in your destination’s time zone.", 400); }
    const schedule = await auth.db.runTransaction(async tx => {
      const [snapshot, member, deleted] = await tx.getAll(ref, membership, deletion);
      if (!recurringDateEntitled(member.data()) || deletionStarted(deleted.get("status"))) throw new RequestError("Recurring date nights are unavailable for this account.", 403);
      const existing = recurringDateRecordSchema.safeParse(snapshot.data()).data;
      if (first.getTime() > now + 366 * 86400000 || first.getTime() <= now && existing?.firstDate !== settings.firstDate) {
        throw new RequestError("Choose a first date and time within the next year.", 400);
      }
      if (existing && existing.dueAt !== null && isDeepStrictEqual(recurringDateSettingsSchema.parse(existing), settings) && existing.timeZone === timeZone) return existing;
      const next = nextRecurringDate({ ...settings, timeZone }, Date.now());
      const record = { ...settings, timeZone, nextDate: next.date, startsAt: next.startsAt, dueAt: next.sendAt, latest: null };
      tx.set(user, { updatedAt: Timestamp.now() }, { merge: true });
      tx.set(ref, record);
      return record;
    });
    return reply({ schedule: summary(schedule) });
  } catch (error) {
    return apiError(error);
  }
}

async function pickVenue(schedule: RecurringDateRecord, ownerId: string) {
  const request = preferences(schedule, schedule.nextDate);
  const wishlist = await getDatabase().collection("sharedWishlists").doc(deletionKey(ownerId)).get();
  const entries = z.array(wishlistEntrySchema).max(wishlistLimit).safeParse(wishlist.get("entries")).data ?? [];
  const excludeIds = schedule.latest?.place ? [schedule.latest.place.id] : [];
  const preferred = entries.filter(entry => entry.city.toLowerCase() === request.city.toLowerCase()
    && entry.country.toLowerCase() === request.country.toLowerCase() && !excludeIds.includes(entry.placeId)).slice(0, 4);
  if (preferred.length) {
    const origin = await planningOrigin(request);
    if (origin) {
      const results = await Promise.allSettled(preferred.map(({ placeId }) => loadPlaceDetails(placeId, false)));
      const places = results.flatMap(result => result.status === "fulfilled" && result.value.operational ? [result.value.record] : []);
      const selected = mapNearbyPlaces({ places }, origin, request, 1).places[0];
      if (selected) return selected;
    }
  }
  const { result } = await loadPlaceCandidates(request, undefined, { excludeIds, limit: 1, signal: AbortSignal.timeout(20000) });
  return result.places[0];
}

async function prepareOccurrence(row: QueryDocumentSnapshot, now: number) {
  const owner = row.ref.parent.parent;
  if (!owner || owner.path !== `users/${owner.id}` || row.id !== "current") return;
  const db = getDatabase();
  const member = owner.collection("membership").doc("current");
  const deletion = db.collection("accountDeletionRequests").doc(deletionKey(owner.id));
  const parsed = recurringDateRecordSchema.safeParse(row.data());
  const [membership, deleted] = await db.getAll(member, deletion);
  const schedule = parsed.data;
  const active = schedule && recurringDateEntitled(membership.data(), now) && !deletionStarted(deleted.get("status"));
  let latest = null;
  let retryAt = null;
  if (active && schedule.startsAt > now) {
    const deliveryId = randomUUID();
    try {
      const place = await pickVenue(schedule, owner.id);
      latest = { deliveryId, date: schedule.nextDate, startsAt: schedule.startsAt, place: place ? { id: place.id, distanceKm: place.distanceKm } : null };
    } catch {
      // Retry temporary provider failures while there is still time to prepare a suggestion.
      if (schedule.startsAt - now > 3600000) retryAt = now + 3600000;
      else latest = { deliveryId, date: schedule.nextDate, startsAt: schedule.startsAt, place: null };
    }
  }
  const draft = latest;
  const job = draft && owner.collection("emailNotifications").doc(recurringDateEmailId(draft.date));
  await db.runTransaction(async tx => {
    const [current, currentMember, currentDeletion] = await tx.getAll(row.ref, member, deletion);
    if (!current.updateTime?.isEqual(row.updateTime)) return;
    if (!schedule || deletionStarted(currentDeletion.get("status"))) {
      tx.update(row.ref, { dueAt: null });
      return;
    }
    const next = nextRecurringDate(schedule, Math.max(now, Date.now(), schedule.startsAt));
    if (!active || !recurringDateEntitled(currentMember.data())) {
      tx.update(row.ref, { nextDate: next.date, startsAt: next.startsAt, dueAt: next.sendAt, latest: null });
      return;
    }
    if (retryAt !== null) { tx.update(row.ref, { dueAt: retryAt }); return; }
    const pending = job && draft && draft.startsAt > Date.now() ? await tx.get(job) : null;
    tx.update(row.ref, { nextDate: next.date, startsAt: next.startsAt, dueAt: next.sendAt, latest: pending ? draft : null });
    if (job && draft && pending && (!pending.exists || ["pending", "skipped"].includes(pending.get("status")) && pending.get("firstAttemptAt") === undefined)) {
      tx.set(job, {
        kind: "recurring-date-night", source: "google", status: "pending", createdAt: Timestamp.now(),
        recurringDate: draft.date, recurringDeliveryId: draft.deliveryId, recurringDeliveryAt: Date.now(),
      });
    }
  });
}

export async function dispatchRecurringDateNights(now = Date.now()) {
  if (!membershipTestEnabled()) return 0;
  const rows = await getDatabase().collectionGroup(recurringDateCollection).where("dueAt", ">=", 0).where("dueAt", "<=", now).orderBy("dueAt").limit(10).get();
  const results = await Promise.allSettled(rows.docs.map(row => prepareOccurrence(row, now)));
  if (results.some(result => result.status === "rejected")) throw new Error("Some recurring date nights could not be prepared.");
  return rows.size;
}

export async function deliverRecurringDateNights(now = Date.now()) {
  if (!membershipTestEnabled() || !process.env.RESEND_API_KEY) return 0;
  const rows = await getDatabase().collectionGroup("emailNotifications").where("recurringDeliveryAt", ">=", 0).where("recurringDeliveryAt", "<=", now)
    .orderBy("recurringDeliveryAt").limit(10).get();
  const results = await Promise.allSettled(rows.docs.map(async row => {
    const owner = row.ref.parent.parent;
    if (!owner || owner.path !== `users/${owner.id}`) return;
    try { await sendDateCreatedEmail(owner.id, row.id); }
    catch (error) {
      await row.ref.update({ recurringDeliveryAt: now + 5 * 60000 }, { lastUpdateTime: row.updateTime }).catch(() => undefined);
      throw error;
    }
  }));
  if (results.some(result => result.status === "rejected")) throw new Error("Some recurring date-night emails could not be sent.");
  return rows.size;
}
