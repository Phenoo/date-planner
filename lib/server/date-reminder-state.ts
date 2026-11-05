import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { datePreferencesSchema } from "@/lib/planner/invitations";
import { calendarInstant } from "@/lib/planner/calendar";

const identifier = z.string().regex(/^[a-f0-9]{64}$/);
export const reminderSourceSchema = datePreferencesSchema.extend({
  source: z.literal("google").default("google"),
  placeId: z.string().min(1).max(200),
  dateStatus: z.enum(["planned", "completed"]),
  createdAt: z.instanceof(Timestamp).optional(),
});
export type ReminderSource = z.infer<typeof reminderSourceSchema>;
export const dateReminderSchema = z.object({
  status: z.enum(["scheduled", "queued", "sent", "canceled"]),
  source: z.literal("google"),
  fingerprint: identifier,
  recipientHash: identifier,
  occurrenceId: identifier,
  revision: z.number().int().positive(),
  startsAt: z.instanceof(Timestamp),
  sendAt: z.instanceof(Timestamp),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});
export type DateReminder = z.infer<typeof dateReminderSchema>;

export function reminderRecipientHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function reminderSchedule(source: ReminderSource, now = Date.now()) {
  if (source.dateStatus !== "planned" || !source.date || !source.startTime) return null;
  try {
    const startsAt = calendarInstant(source.date, source.startTime, source.timeZone);
    if (startsAt.getTime() <= now) return null;
    const fingerprint = createHash("sha256").update(JSON.stringify({ placeId: source.placeId, date: source.date, startTime: source.startTime, timeZone: source.timeZone, ...(source.createdAt ? { createdAt: source.createdAt.toMillis() } : {}) })).digest("hex");
    return { fingerprint, startsAt: Timestamp.fromDate(startsAt), sendAt: Timestamp.fromMillis(Math.max(now, startsAt.getTime() - 86400000)) };
  } catch { return null; }
}

export function nextDateReminder(dateId: string, source: ReminderSource, recipientHash: string, current: DateReminder | null, now = Date.now()): DateReminder | null {
  const schedule = reminderSchedule(source, now);
  if (!schedule) return null;
  if (current && current.fingerprint === schedule.fingerprint && current.recipientHash === recipientHash) return current;
  const revision = (current?.revision ?? 0) + 1;
  const occurrenceId = createHash("sha256").update(`date-reminder:${dateId}:${revision}:${schedule.fingerprint}:${recipientHash}`).digest("hex");
  return { ...schedule, status: "scheduled", source: "google", recipientHash, revision, occurrenceId, createdAt: current?.createdAt ?? Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now) };
}

export function reminderCanSend(reminder: DateReminder, occurrenceId: string, source: ReminderSource, email: string, now = Date.now()) {
  const schedule = reminderSchedule(source, now);
  return reminder.status === "queued" && reminder.occurrenceId === occurrenceId && reminder.sendAt.toMillis() <= now
    && reminder.recipientHash === reminderRecipientHash(email) && schedule !== null
    && reminder.fingerprint === schedule.fingerprint && reminder.startsAt.isEqual(schedule.startsAt);
}
