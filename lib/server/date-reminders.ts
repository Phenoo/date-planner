import "server-only";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase, getFirebaseAdmin } from "@/lib/firebase/server";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { hasQualifyingGoogleRating } from "@/lib/maps/recommendation-quality";
import { dateSelectionId } from "./date-invitations";
import { deletionKey } from "./account-privacy";
import { dateReminderSchema, nextDateReminder, reminderRecipientHash, reminderSchedule, reminderSourceSchema, type DateReminder } from "./date-reminder-state";
import { RequestError } from "@/lib/planner/http";

export const dateReminderInputSchema = z.object({ sessionId: z.uuid(), placeId: z.string().trim().min(1).max(200) }).strict();

function deleting(snapshot: DocumentSnapshot) {
  return ["requested", "processing", "complete"].includes(String(snapshot.data()?.status));
}

async function storeReminder(tx: Transaction, user: DocumentReference, dateId: string, ref: DocumentReference, current: DateReminder | null, next: DateReminder | null, now: number) {
  const replaced = current && (!next || current.occurrenceId !== next.occurrenceId) ? user.collection("emailNotifications").doc(current.occurrenceId) : null;
  const due = next?.status === "scheduled" && next.sendAt.toMillis() <= now;
  const queued = due && next ? user.collection("emailNotifications").doc(next.occurrenceId) : null;
  const oldJob = replaced ? await tx.get(replaced) : null;
  const newJob = queued ? await tx.get(queued) : null;
  if (replaced && oldJob?.exists && !["sent", "skipped", "failed", "needs-review"].includes(String(oldJob.data()?.status))) {
    tx.update(replaced, { status: "skipped", reason: "reminder-replaced", payload: FieldValue.delete(), leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete(), updatedAt: Timestamp.fromMillis(now) });
  }
  if (!next) {
    if (current) tx.set(ref, { ...current, status: "canceled", updatedAt: Timestamp.fromMillis(now) });
    return;
  }
  const record = due ? { ...next, status: "queued" as const, updatedAt: Timestamp.fromMillis(now) } : next;
  if (queued && !newJob?.exists) tx.create(queued, {
    kind: "reminder", source: "google", sourceDateId: dateId, reminderOccurrenceId: next.occurrenceId, status: "pending", createdAt: Timestamp.fromMillis(now),
  });
  tx.set(ref, dateReminderSchema.parse(record));
}

export async function enableDateReminder(request: Request, input: z.infer<typeof dateReminderInputSchema>) {
  const auth = await authenticatedClient(request);
  if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to save an email reminder for this date.", 401);
  const account = await getAuth(getFirebaseAdmin()).getUser(auth.user.uid);
  const email = z.email().max(254).safeParse(account.email);
  if (account.disabled || !account.emailVerified || !email.success) throw new RequestError("Confirm your email address before adding a reminder.", 403);
  const user = auth.db.collection("users").doc(auth.user.uid);
  const dateId = dateSelectionId(input.sessionId, input.placeId);
  const history = user.collection("dateHistory").doc(dateId);
  const source = await history.get();
  const parsed = reminderSourceSchema.safeParse(source.data());
  if (!source.exists || !parsed.success || parsed.data.placeId !== input.placeId) throw new RequestError("Save this date to your account before adding a reminder.", 404);
  const details = await loadPlaceDetails(input.placeId, false);
  if (!details.operational || !hasQualifyingGoogleRating(details.record.rating)) throw new RequestError("This venue needs another look before we can add a reminder. Review your date first.", 409);
  const recipientHash = reminderRecipientHash(email.data);
  const ref = user.collection("dateReminders").doc(dateId);
  return auth.db.runTransaction(async tx => {
    const [latest, reminder, deletion] = await Promise.all([tx.get(history), tx.get(ref), tx.get(auth.db.collection("accountDeletionRequests").doc(deletionKey(auth.user.uid)))]);
    if (deleting(deletion)) throw new RequestError("Reminders are unavailable while account deletion is requested.", 409);
    if (!latest.exists || !source.updateTime || !latest.updateTime?.isEqual(source.updateTime)) throw new RequestError("Your date changed. Reopen it before adding a reminder.", 409);
    const current = dateReminderSchema.safeParse(reminder.data());
    const now = Date.now();
    const next = nextDateReminder(dateId, parsed.data, recipientHash, current.success ? current.data : null, now);
    if (!next) throw new RequestError("Choose an upcoming day and time before adding a reminder.", 409);
    if (next.status === "canceled") throw new RequestError("This reminder is no longer active. Review or update your date before adding another.", 409);
    await storeReminder(tx, user, dateId, ref, current.success ? current.data : null, next, now);
    return { scheduled: true as const, sendAt: next.sendAt.toDate().toISOString() };
  });
}

export async function reconcileDateReminder(ownerId: string, dateId: string) {
  if (!ownerId || ownerId.length > 128 || ownerId.includes("/") || !/^[a-f0-9]{64}$/.test(dateId)) return;
  const db = getDatabase();
  const user = db.collection("users").doc(ownerId);
  const ref = user.collection("dateReminders").doc(dateId);
  await db.runTransaction(async tx => {
    const [reminder, history, owner, deletion] = await Promise.all([tx.get(ref), tx.get(user.collection("dateHistory").doc(dateId)), tx.get(user), tx.get(db.collection("accountDeletionRequests").doc(deletionKey(ownerId)))]);
    if (!reminder.exists) return;
    const current = dateReminderSchema.safeParse(reminder.data());
    if (!current.success) { tx.update(ref, { status: "canceled", updatedAt: Timestamp.now() }); return; }
    const parsed = reminderSourceSchema.safeParse(history.data());
    const now = Date.now();
    if (current.data.status === "canceled" && parsed.success && reminderSchedule(parsed.data, now)?.fingerprint === current.data.fingerprint) return;
    const next = history.exists && owner.exists && !deleting(deletion) && parsed.success
      ? nextDateReminder(dateId, parsed.data, current.data.recipientHash, current.data, now) : null;
    await storeReminder(tx, user, dateId, ref, current.data, next, now);
  });
}

export async function dispatchDueDateReminders(now = Date.now()) {
  const due = await getDatabase().collectionGroup("dateReminders").where("status", "==", "scheduled").where("sendAt", "<=", Timestamp.fromMillis(now)).orderBy("sendAt").limit(100).get();
  const rows = due.docs.flatMap(row => {
    const owner = row.ref.parent.parent;
    return owner && owner.path === `users/${owner.id}` ? [{ ownerId: owner.id, dateId: row.id }] : [];
  });
  let failed = false;
  for (let offset = 0; offset < rows.length; offset += 5) {
    const results = await Promise.allSettled(rows.slice(offset, offset + 5).map(row => reconcileDateReminder(row.ownerId, row.dateId)));
    if (results.some(result => result.status === "rejected")) failed = true;
  }
  if (failed) throw new Error("Some email reminders could not be queued. They will be retried.");
  return rows.length;
}
