import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";

export const dateEmailPayloadSchema = z.object({
  from: z.string().min(1).max(320),
  to: z.tuple([z.email().max(254)]),
  reply_to: z.email().max(254),
  subject: z.string().min(1).max(300),
  text: z.string().min(1).max(30000),
  html: z.string().min(1).max(150000),
}).strict();

export const dateEmailJobSchema = z.object({
  kind: z.enum(["date-created", "reminder", "invitation-reply", "recurring-date-night"]).default("date-created"),
  recurringDate: z.iso.date().optional(),
  recurringDeliveryId: z.uuid().optional(),
  sourceDateId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  reminderOccurrenceId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  source: z.enum(["google", "catalog"]),
  recipeId: z.string().max(500).optional(),
  status: z.enum(["pending", "sending", "retry", "sent", "skipped", "failed", "needs-review"]),
  createdAt: z.instanceof(Timestamp),
  attempts: z.number().int().nonnegative().default(0),
  firstAttemptAt: z.instanceof(Timestamp).optional(),
  payload: dateEmailPayloadSchema.optional(),
  personalized: z.boolean().optional(),
  leaseId: z.uuid().optional(),
  leaseUntil: z.instanceof(Timestamp).optional(),
});

export type DateEmailJob = z.infer<typeof dateEmailJobSchema>;
export type DateEmailPayload = z.infer<typeof dateEmailPayloadSchema>;

export function invitationReplyEmailId(invitationKey: string) {
  return createHash("sha256").update(`invitation-reply:${invitationKey}`).digest("hex");
}

export function queueInvitationReplyEmail(tx: Transaction, userRef: DocumentReference, input: {
  dateId: string;
  invitationKey: string;
  source: DateEmailJob["source"];
}) {
  tx.create(userRef.collection("emailNotifications").doc(invitationReplyEmailId(input.invitationKey)), {
    kind: "invitation-reply",
    sourceDateId: input.dateId,
    source: input.source,
    status: "pending",
    createdAt: Timestamp.now(),
  });
}

export async function queueDateCreatedEmail(
  tx: Transaction,
  userRef: DocumentReference,
  input: { dateId: string; source: "google" | "catalog"; recipeId?: string },
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(input.dateId) || input.source === "catalog" && input.recipeId === undefined) throw new Error("Invalid date email job.");
  const job = userRef.collection("emailNotifications").doc(input.dateId);
  if ((await tx.get(job)).exists) return;
  tx.create(job, {
    source: input.source,
    ...(input.source === "catalog" ? { recipeId: input.recipeId } : {}),
    status: "pending",
    createdAt: Timestamp.now(),
  });
}
