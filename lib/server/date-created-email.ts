import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { dateCreatedEmail } from "@/lib/email/date-created";
import { dateReminderEmail } from "@/lib/email/date-reminder";
import { brandEmail } from "@/lib/email/brand-template";
import { getDatabase, getFirebaseAdmin } from "@/lib/firebase/server";
import { savedDocumentId } from "@/lib/firebase/paths";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { hasQualifyingGoogleRating } from "@/lib/maps/recommendation-quality";
import { getCatalog } from "@/lib/planner/catalog";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { datePreferencesSchema } from "@/lib/planner/invitations";
import { decodeRecipe } from "@/lib/planner/money";
import { calendarLabel } from "@/lib/planner/schedule";
import { siteName, siteOrigin, supportEmail } from "@/lib/seo/site";
import { deletionKey } from "./account-privacy";
import { dateEmailJobSchema, dateEmailPayloadSchema, type DateEmailJob, type DateEmailPayload } from "./date-email-outbox";
import { dateReminderSchema, reminderCanSend, reminderSourceSchema } from "./date-reminder-state";

export { queueDateCreatedEmail } from "./date-email-outbox";

const leaseMs = 60000;
// Stop before the provider's 24-hour key expiry, including network/clock margin.
const retryWindowMs = 24 * 3600000 - 60000;
const terminal = new Set<DateEmailJob["status"]>(["sent", "skipped", "failed", "needs-review"]);
const scheduleSchema = datePreferencesSchema.extend({ source: z.enum(["google", "catalog"]).default("google"), placeId: z.string().min(1).max(200) });
const providerResultSchema = z.object({ id: z.string().min(1).max(200).optional(), name: z.string().max(100).optional() });

type Source = { ref: DocumentReference; snapshot: DocumentSnapshot; payload?: DateEmailPayload; reminder?: DocumentReference };
type Claim = { leaseId: string; payload: DateEmailPayload; personalized: boolean };

function deleting(record: unknown) {
  return !!record && typeof record === "object" && "status" in record && ["requested", "processing", "complete"].includes(String(record.status));
}

function emailBody(to: string, input: Parameters<typeof dateCreatedEmail>[0]): DateEmailPayload {
  return { from: `${siteName} <noreply@adateatlas.com>`, to: [to], reply_to: supportEmail, ...dateCreatedEmail(input) };
}

function genericEmailBody(to: string): DateEmailPayload {
  return { from: `${siteName} <noreply@adateatlas.com>`, to: [to], reply_to: supportEmail, subject: `Your date is saved | ${siteName}`, ...brandEmail({
    preheader: "Your date plan is saved. Open My dates whenever you’re ready.",
    eyebrow: "Your date, saved",
    title: "It feels like a date.",
    paragraphs: ["Your date plan is saved in your account. Sign in to My dates whenever you’re ready to open it."],
    primaryAction: { label: "Open my date", url: `${siteOrigin}/saved` },
  }) };
}

function scheduleLabel(date: z.infer<typeof datePreferencesSchema>) {
  const day = date.date ? calendarLabel(date.date, { weekday: "long", day: "numeric", month: "long" }) : date.datePreference === "weekend" ? "Weekend" : "Weekday";
  if (!date.startTime) return `${day} · Time to decide together`;
  const [hour, minute] = date.startTime.split(":").map(Number);
  return `${day} · ${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

async function sourceFor(user: DocumentReference, dateId: string, job: DateEmailJob, recipient: string, personalized: boolean): Promise<Source | null> {
  if (job.kind === "reminder" && (!job.sourceDateId || !job.reminderOccurrenceId || job.source !== "google" || !personalized)) return null;
  const historyRef = user.collection("dateHistory").doc(job.kind === "reminder" ? job.sourceDateId ?? dateId : dateId);
  const history = await historyRef.get();
  if (history.exists) {
    const parsed = scheduleSchema.safeParse(history.data());
    if (!parsed.success || parsed.data.source !== job.source) return null;
    if (job.kind === "reminder") {
      const reminderRef = user.collection("dateReminders").doc(job.sourceDateId ?? dateId);
      const reminder = dateReminderSchema.safeParse((await reminderRef.get()).data());
      const source = reminderSourceSchema.safeParse(history.data());
      if (!reminder.success || !source.success || !reminderCanSend(reminder.data, job.reminderOccurrenceId ?? "", source.data, recipient)) return null;
      const details = await loadPlaceDetails(parsed.data.placeId, false);
      if (!details.operational || !hasQualifyingGoogleRating(details.record.rating)) return null;
      if (job.payload) return { ref: historyRef, snapshot: history, reminder: reminderRef };
      return { ref: historyRef, snapshot: history, reminder: reminderRef, payload: { from: `${siteName} <noreply@adateatlas.com>`, to: [recipient], reply_to: supportEmail, ...dateReminderEmail({ venueName: details.place.name, address: details.place.address, city: parsed.data.city, scheduleLabel: scheduleLabel(parsed.data) }) } };
    }
    if (job.payload) return { ref: historyRef, snapshot: history };
    const date = parsed.data;
    if (!personalized) return { ref: historyRef, snapshot: history, payload: genericEmailBody(recipient) };
    const when = scheduleLabel(date);
    if (job.source === "google") {
      const details = await loadPlaceDetails(date.placeId, false);
      return { ref: historyRef, snapshot: history, payload: emailBody(recipient, { venueName: details.place.name, address: details.place.address, city: date.city, scheduleLabel: when, googleAttribution: true }) };
    }
    const experience = (await getCatalog()).find(item => item.id === date.placeId && !item.demo);
    if (!experience) return null;
    return { ref: historyRef, snapshot: history, payload: emailBody(recipient, { venueName: experience.venue, address: `${experience.area}, ${experience.city}, ${experience.country}`, city: date.city, scheduleLabel: when }) };
  }
  if (job.source !== "catalog" || job.recipeId === undefined) return null;
  const savedRef = user.collection("savedPlans").doc(savedDocumentId(job.recipeId));
  const saved = await savedRef.get();
  const recipe = decodeRecipe(saved.data()?.recipe);
  if (!saved.exists || !recipe.success) return null;
  const catalog = await getCatalog();
  const experiences = recipe.data.experienceIds.map(id => catalog.find(item => item.id === id && !item.demo));
  const plan = experiences.every(item => item !== undefined) ? recalculateExactPlan(recipe.data.request, experiences, undefined, catalog) : null;
  if (!plan || plan.demo || createHash("sha256").update(`catalog:${plan.id}`).digest("hex") !== dateId) return null;
  if (job.payload) return { ref: savedRef, snapshot: saved };
  if (!personalized) return { ref: savedRef, snapshot: saved, payload: genericEmailBody(recipient) };
  const experience = plan.activities[0].experience;
  return { ref: savedRef, snapshot: saved, payload: emailBody(recipient, { venueName: experience.venue, address: `${experience.area}, ${experience.city}, ${experience.country}`, city: plan.request.city, scheduleLabel: scheduleLabel(plan.request) }) };
}

async function ownerEmail(ownerId: string) {
  try {
    const user = await getAuth(getFirebaseAdmin()).getUser(ownerId);
    if (user.disabled) return { email: null, verified: false, reason: "account-disabled" };
    if (!user.email) return { email: null, verified: false, reason: "missing-email" };
    const email = z.email().max(254).safeParse(user.email);
    return email.success ? { email: email.data, verified: user.emailVerified, reason: null } : { email: null, verified: false, reason: "invalid-email" };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return { email: null, verified: false, reason: "missing-account" };
    throw error;
  }
}

export async function sendDateCreatedEmail(ownerId: string, dateId: string): Promise<void> {
  if (!ownerId || ownerId.length > 128 || ownerId.includes("/") || !/^[a-f0-9]{64}$/.test(dateId)) throw new Error("Invalid date email identifiers.");
  const db = getDatabase();
  const user = db.collection("users").doc(ownerId);
  const jobRef = user.collection("emailNotifications").doc(dateId);
  const deletion = db.collection("accountDeletionRequests").doc(deletionKey(ownerId));

  async function finish(status: "sent" | "skipped" | "failed" | "needs-review" | "retry", reason: string, leaseId?: string, emailId?: string) {
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(jobRef);
      const job = dateEmailJobSchema.safeParse(snapshot.data());
      if (!snapshot.exists || !job.success || terminal.has(job.data.status) || leaseId && job.data.leaseId !== leaseId) return;
      if (!leaseId && job.data.status === "sending" && job.data.leaseUntil && job.data.leaseUntil.toMillis() > Date.now()) throw new Error("Date email is already being processed.");
      const reminderRef = job.data.kind === "reminder" && job.data.sourceDateId ? user.collection("dateReminders").doc(job.data.sourceDateId) : null;
      const reminder = reminderRef ? dateReminderSchema.safeParse((await tx.get(reminderRef)).data()) : null;
      tx.update(jobRef, { status, reason, updatedAt: Timestamp.now(), leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete(), ...(status !== "retry" ? { payload: FieldValue.delete() } : {}), ...(emailId ? { emailId, sentAt: Timestamp.now() } : {}) });
      if (reminderRef && reminder?.success && reminder.data.occurrenceId === job.data.reminderOccurrenceId && status !== "retry") tx.update(reminderRef, { status: status === "sent" ? "sent" : "canceled", updatedAt: Timestamp.now() });
    });
  }

  const initial = dateEmailJobSchema.safeParse((await jobRef.get()).data());
  if (!initial.success || terminal.has(initial.data.status)) return;
  if (initial.data.firstAttemptAt && Date.now() - initial.data.firstAttemptAt.toMillis() >= retryWindowMs) { await finish("needs-review", "retry-window-expired"); return; }
  const [owner, deleted, recipient] = await Promise.all([user.get(), deletion.get(), ownerEmail(ownerId)]);
  if (!owner.exists || deleting(deleted.data()) || !recipient.email) {
    await finish("skipped", !owner.exists ? "missing-owner" : deleting(deleted.data()) ? "account-deleting" : recipient.reason ?? "missing-recipient");
    return;
  }
  if (initial.data.payload && initial.data.payload.to[0].toLowerCase() !== recipient.email.toLowerCase()) { await finish("skipped", "recipient-changed"); return; }
  if (initial.data.payload && initial.data.personalized !== false && !recipient.verified) { await finish("skipped", "verification-changed"); return; }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Date email delivery is not configured.");
  const source = await sourceFor(user, dateId, initial.data, recipient.email, recipient.verified);
  if (!source) { await finish("skipped", "missing-source"); return; }

  const leaseId = randomUUID();
  const claim: Claim | null = await db.runTransaction(async tx => {
    const [snapshot, currentOwner, currentDeletion, currentSource, currentReminder] = await Promise.all([tx.get(jobRef), tx.get(user), tx.get(deletion), tx.get(source.ref), source.reminder ? tx.get(source.reminder) : Promise.resolve(null)]);
    const parsed = dateEmailJobSchema.safeParse(snapshot.data());
    if (!parsed.success || terminal.has(parsed.data.status)) return null;
    const job = parsed.data;
    const now = Date.now();
    if (job.status === "sending" && job.leaseUntil && job.leaseUntil.toMillis() > now) throw new Error("Date email is already being processed.");
    if (!currentOwner.exists || deleting(currentDeletion.data()) || !currentSource.exists) {
      tx.update(jobRef, { status: "skipped", reason: "source-unavailable", payload: FieldValue.delete(), leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete() });
      return null;
    }
    if (job.kind === "reminder") {
      const reminder = dateReminderSchema.safeParse(currentReminder?.data());
      const reminderSource = reminderSourceSchema.safeParse(currentSource.data());
      if (!reminder.success || !reminderSource.success || !reminderCanSend(reminder.data, job.reminderOccurrenceId ?? "", reminderSource.data, recipient.email ?? "")) {
        tx.update(jobRef, { status: "skipped", reason: "reminder-changed", payload: FieldValue.delete(), leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete() });
        return null;
      }
    }
    if (job.firstAttemptAt && now - job.firstAttemptAt.toMillis() >= retryWindowMs) {
      tx.update(jobRef, { status: "needs-review", reason: "retry-window-expired", payload: FieldValue.delete(), leaseId: FieldValue.delete(), leaseUntil: FieldValue.delete() });
      return null;
    }
    if (!currentSource.updateTime || !source.snapshot.updateTime || !currentSource.updateTime.isEqual(source.snapshot.updateTime)) throw new Error("Date details changed before the email was prepared.");
    const candidatePayload = job.payload ?? source.payload;
    if (!candidatePayload) throw new Error("Date email content could not be prepared.");
    const payload = dateEmailPayloadSchema.parse(candidatePayload);
    const personalized = job.payload ? job.personalized !== false : recipient.verified;
    tx.update(jobRef, { status: "sending", attempts: job.attempts + 1, firstAttemptAt: job.firstAttemptAt ?? Timestamp.fromMillis(now), payload, personalized, leaseId, leaseUntil: Timestamp.fromMillis(now + leaseMs) });
    return { leaseId, payload, personalized };
  });
  if (!claim) return;

  try {
    const [currentOwner, currentDeletion, currentJob, currentSource, currentRecipient, currentReminder] = await Promise.all([user.get(), deletion.get(), jobRef.get(), source.ref.get(), ownerEmail(ownerId), source.reminder ? source.reminder.get() : Promise.resolve(null)]);
    const latest = dateEmailJobSchema.safeParse(currentJob.data());
    if (!latest.success || latest.data.status !== "sending" || latest.data.leaseId !== claim.leaseId) return;
    if (!currentOwner.exists || deleting(currentDeletion.data()) || !currentSource.exists || !currentRecipient.email || currentRecipient.email.toLowerCase() !== claim.payload.to[0].toLowerCase() || claim.personalized && !currentRecipient.verified) {
      await finish("skipped", "recipient-or-source-unavailable", claim.leaseId);
      return;
    }
    if (latest.data.kind === "reminder") {
      const reminder = dateReminderSchema.safeParse(currentReminder?.data());
      const reminderSource = reminderSourceSchema.safeParse(currentSource.data());
      if (!reminder.success || !reminderSource.success || !currentRecipient.verified || !reminderCanSend(reminder.data, latest.data.reminderOccurrenceId ?? "", reminderSource.data, currentRecipient.email)) {
        await finish("skipped", "reminder-no-longer-active", claim.leaseId);
        return;
      }
    }
    if (!latest.data.firstAttemptAt || Date.now() - latest.data.firstAttemptAt.toMillis() >= retryWindowMs) {
      await finish("needs-review", "retry-window-expired", claim.leaseId);
      return;
    }
    if (!latest.data.leaseUntil || latest.data.leaseUntil.toMillis() <= Date.now()) throw new Error("Date email lease expired before delivery.");
    if (!currentSource.updateTime || !source.snapshot.updateTime || !currentSource.updateTime.isEqual(source.snapshot.updateTime)) throw new Error("Date details changed before delivery.");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `${latest.data.kind === "reminder" ? "date-reminder" : "date-created"}/${createHash("sha256").update(ownerId).digest("hex")}/${dateId}` }, body: JSON.stringify(claim.payload), signal: AbortSignal.timeout(15000) });
    const result = providerResultSchema.safeParse(await response.json().catch(() => null));
    if (response.ok && result.success && result.data.id) { await finish("sent", "provider-accepted", claim.leaseId, result.data.id); return; }
    if (response.status === 409 && (!result.success || result.data.name !== "concurrent_idempotent_requests")) { await finish("needs-review", "idempotency-conflict", claim.leaseId); return; }
    if (!response.ok && response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status)) { await finish("failed", "provider-rejected", claim.leaseId); return; }
    throw new Error("Date email delivery will be retried.");
  } catch {
    await finish("retry", "delivery-unconfirmed", claim.leaseId);
    throw new Error("Date email delivery will be retried.");
  }
}
