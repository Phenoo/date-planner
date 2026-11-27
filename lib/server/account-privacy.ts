import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin, getDatabase } from "@/lib/firebase/server";
import { RequestError } from "@/lib/planner/http";
import { membershipTestEnabled } from "./membership-config";
import { membershipRecordSchema } from "@/lib/membership/schema";
import { cancelProviderSubscription } from "./billing-providers";
import { sendAccountDeletionEmail } from "./account-deletion-email";
import { removeTransferredGuestData } from "./account-deletion-guests";
export const deletionKey = (uid: string) => createHash("sha256").update(uid).digest("hex");
export const deletionDrainMs = 10 * 60 * 1000;
export const deletionWithdrawMs = 15 * 60 * 1000;

export async function processDeletion(id: string, operatorId?: string) {
  const db = getDatabase(); const job = db.collection("accountDeletionRequests").doc(id);
  const data = (await job.get()).data();
  if (!data || typeof data.targetUid !== "string") {
    if (data?.status === "complete") return { complete: true };
    throw new RequestError("Deletion request not found.", 404);
  }
  if (data.targetUid === operatorId) throw new RequestError("Another administrator must process this request so you can still monitor the deletion if it is interrupted.", 409);
  if (data.status !== "requested" && data.status !== "processing") throw new RequestError("This request isn't ready for processing.", 409);
  if (data.automaticVersion === 1 && data.status === "requested" && (!(data.processAfter instanceof Timestamp) || data.processAfter.toMillis() > Date.now())) throw new RequestError("The withdrawal window is still open.", 409);
  if (membershipTestEnabled()) {
    const user = db.collection("users").doc(data.targetUid);
    const member = membershipRecordSchema.safeParse((await user.collection("membership").doc("current").get()).data());
    if (member.success) await cancelProviderSubscription({ provider: member.data.provider, subscriptionId: member.data.subscriptionId, customerId: member.data.customerId, returnUrl: "http://localhost:3005/membership" });
    else if ((await user.collection("billingCheckout").doc("current").get()).exists) throw new RequestError("Review this account’s pending test checkout before removing it.", 409);
    for (const name of ["billingSubscriptions", "billingPayments"]) {
      const mappings = await db.collection(name).where("uid", "==", data.targetUid).limit(100).get();
      if (!mappings.empty) { const batch = db.batch(); mappings.docs.forEach((row) => batch.delete(row.ref)); await batch.commit(); return { complete: false }; }
    }
  }
  const processing = await db.runTransaction(async (tx) => {
    const current = (await tx.get(job)).data();
    if (!current || current.status !== "requested" && current.status !== "processing") throw new RequestError("This request has changed. Refresh the queue.", 409);
    const requestedAt = data.requestedAt instanceof Timestamp ? data.requestedAt.toMillis() : null;
    const currentRequestedAt = current.requestedAt instanceof Timestamp ? current.requestedAt.toMillis() : null;
    if (current.targetUid !== data.targetUid || currentRequestedAt !== requestedAt || current.automaticVersion !== data.automaticVersion) throw new RequestError("This request has changed. Refresh the queue.", 409);
    if (current.automaticVersion === 1 && current.status === "requested" && (!(current.processAfter instanceof Timestamp) || current.processAfter.toMillis() > Date.now())) throw new RequestError("The withdrawal window is still open.", 409);
    tx.update(job, { status: "processing", updatedAt: Timestamp.now() });
    return current;
  });
  const auth = getAuth(getFirebaseAdmin());
  try { await auth.updateUser(data.targetUid, { disabled: true }); await auth.revokeRefreshTokens(data.targetUid); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found")) throw error; }
  const disabledAt = data.disabledAt instanceof Timestamp ? data.disabledAt : Timestamp.now();
  if (!(data.disabledAt instanceof Timestamp)) await job.update({ disabledAt });
  const transferredGuests = await removeTransferredGuestData(data.targetUid);
  if (!transferredGuests.complete) return transferredGuests;
  if (disabledAt.toMillis() + deletionDrainMs > Date.now()) return { complete: false, retryAt: disabledAt.toMillis() + deletionDrainMs, message: "Account access is disabled. Allow existing requests to finish before removing records." };
  await db.collection("sharedWishlists").doc(id).delete();
  const invitations = await db.collection("dateInvitations").where("ownerId", "==", data.targetUid).limit(100).get();
  if (!invitations.empty) { const batch = db.batch(); invitations.docs.forEach((row) => batch.delete(row.ref)); await batch.commit(); return { complete: false }; }
  const user = db.collection("users").doc(data.targetUid);
  for (const collection of await user.listCollections()) {
    const rows = await collection.limit(100).get();
    if (rows.empty) continue;
    const batch = db.batch(); rows.docs.forEach((row) => batch.delete(row.ref)); await batch.commit(); return { complete: false };
  }
  await user.delete();
  try { await auth.deleteUser(data.targetUid); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found")) throw error; }
  if (data.automaticVersion === 1 && typeof data.confirmationEmail === "string") await sendAccountDeletionEmail(data.confirmationEmail, id);
  await job.set({ status: "complete", completedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000), ...(typeof processing.receiptHash === "string" ? { receiptHash: processing.receiptHash } : {}) });
  return { complete: true };
}

export async function processAutomaticDeletions() {
  const db = getDatabase();
  const rows = await db.collection("accountDeletionRequests").where("automaticVersion", "==", 1).where("processAfter", "<=", Timestamp.now()).limit(25).get();
  let completed = 0;
  for (const row of rows.docs) {
    const data = row.data();
    if (data.status !== "requested" && data.status !== "processing" || !(data.processAfter instanceof Timestamp) || data.processAfter.toMillis() > Date.now()) continue;
    const reschedule = (next: number) => db.runTransaction(async tx => {
      const current = (await tx.get(row.ref)).data();
      if (current?.automaticVersion === 1 && (current.status === "requested" || current.status === "processing") && current.requestedAt instanceof Timestamp && data.requestedAt instanceof Timestamp && current.requestedAt.isEqual(data.requestedAt)) {
        tx.update(row.ref, { processAfter: Timestamp.fromMillis(Math.max(next, current.processAfter instanceof Timestamp ? current.processAfter.toMillis() : next)) });
      }
    });
    try {
      for (let batch = 0; batch < 8; batch++) {
        const result = await processDeletion(row.id);
        if (result.complete) { completed++; break; }
        if (result.retryAt) { await reschedule(result.retryAt); break; }
      }
    } catch {
      await reschedule(Date.now() + 5 * 60000);
      console.error("An automatic account deletion needs another processing attempt.");
    }
  }
  return completed;
}
