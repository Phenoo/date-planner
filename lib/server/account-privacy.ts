import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin, getDatabase } from "@/lib/firebase/server";
import { RequestError } from "@/lib/planner/http";
export const deletionKey = (uid: string) => createHash("sha256").update(uid).digest("hex");
export const deletionDrainMs = 10 * 60 * 1000;

export async function processDeletion(id: string, operatorId: string) {
  const db = getDatabase(); const job = db.collection("accountDeletionRequests").doc(id);
  const data = (await job.get()).data();
  if (!data || typeof data.targetUid !== "string") {
    if (data?.status === "complete") return { complete: true };
    throw new RequestError("Deletion request not found.", 404);
  }
  if (data.targetUid === operatorId) throw new RequestError("Another administrator must process this request so you can still monitor the deletion if it is interrupted.", 409);
  if (data.status !== "requested" && data.status !== "processing") throw new RequestError("This request isn't ready for processing.", 409);
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(job)).data();
    if (!current || current.status !== "requested" && current.status !== "processing") throw new RequestError("This request has changed. Refresh the queue.", 409);
    tx.update(job, { status: "processing", updatedAt: Timestamp.now() });
  });
  const auth = getAuth(getFirebaseAdmin());
  try { await auth.updateUser(data.targetUid, { disabled: true }); await auth.revokeRefreshTokens(data.targetUid); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found")) throw error; }
  const disabledAt = data.disabledAt instanceof Timestamp ? data.disabledAt : Timestamp.now();
  if (!(data.disabledAt instanceof Timestamp)) await job.update({ disabledAt });
  if (disabledAt.toMillis() + deletionDrainMs > Date.now()) return { complete: false, retryAt: disabledAt.toMillis() + deletionDrainMs, message: "Account access is disabled. Allow existing requests to finish before removing records." };
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
  await job.set({ status: "complete", completedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
  return { complete: true };
}
