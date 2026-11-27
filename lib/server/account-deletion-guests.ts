import "server-only";
import { createHash } from "node:crypto";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { getDatabase, getFirebaseAdmin } from "@/lib/firebase/server";

const drainMs = 10 * 60000;
const isPermanent = (user: UserRecord | null) => !!user && (!!user.email || !!user.phoneNumber || user.providerData.length > 0);
async function identity(uid: string) {
  try { return await getAuth(getFirebaseAdmin()).getUser(uid); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function unlinkUpgradedSource(ref: DocumentReference, ownerId: string, user: UserRecord) {
  await getDatabase().runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.transferredTo !== ownerId) return;
    tx.update(ref, {
      transferredTo: FieldValue.delete(), deletionFor: FieldValue.delete(), deletionDisabledAt: FieldValue.delete(),
      ...(current.deletionFor === ownerId && user.disabled ? { deletionAccessReview: true } : {}),
    });
  });
}

async function stillOwnedGuest(ref: DocumentReference, ownerId: string) {
  const [snapshot, user] = await Promise.all([ref.get(), identity(ref.id)]);
  const data = snapshot.data();
  if (data?.transferredTo !== ownerId || data.deletionFor !== ownerId) return false;
  if (user && isPermanent(user)) { await unlinkUpgradedSource(ref, ownerId, user); return false; }
  return !user || user.disabled;
}

export async function removeTransferredGuestData(ownerId: string): Promise<{ complete: boolean; retryAt?: number }> {
  const db = getDatabase(); const auth = getAuth(getFirebaseAdmin());
  const sources = await db.collection("users").where("transferredTo", "==", ownerId).limit(25).get();
  if (sources.empty) return { complete: true };
  let retryAt = 0;
  for (const source of sources.docs) {
    const user = await identity(source.id);
    if (user && isPermanent(user)) { await unlinkUpgradedSource(source.ref, ownerId, user); continue; }
    const claimed = await db.runTransaction(async tx => {
      const current = (await tx.get(source.ref)).data();
      if (current?.transferredTo !== ownerId) return false;
      tx.update(source.ref, { deletionFor: ownerId });
      return true;
    });
    if (!claimed) continue;
    if (user) { await auth.updateUser(source.id, { disabled: true }); await auth.revokeRefreshTokens(source.id); }
    const afterDisable = await identity(source.id);
    if (afterDisable && isPermanent(afterDisable)) { await unlinkUpgradedSource(source.ref, ownerId, afterDisable); continue; }
    const disabledAt = await db.runTransaction(async tx => {
      const current = (await tx.get(source.ref)).data();
      if (current?.transferredTo !== ownerId || current.deletionFor !== ownerId) return null;
      const time = current.deletionDisabledAt instanceof Timestamp && user?.disabled !== false ? current.deletionDisabledAt : Timestamp.now();
      tx.update(source.ref, { deletionDisabledAt: time });
      return time;
    });
    if (disabledAt && disabledAt.toMillis() + drainMs > Date.now()) retryAt = Math.max(retryAt, disabledAt.toMillis() + drainMs);
  }
  if (retryAt) return { complete: false, retryAt };
  for (const source of sources.docs) {
    if (!await stillOwnedGuest(source.ref, ownerId)) continue;
    const invitations = await db.collection("dateInvitations").where("ownerId", "==", source.id).limit(100).get();
    if (!invitations.empty) {
      if (!await stillOwnedGuest(source.ref, ownerId)) return { complete: false };
      const batch = db.batch(); invitations.docs.forEach(row => batch.delete(row.ref)); await batch.commit(); return { complete: false };
    }
    for (const collection of await source.ref.listCollections()) {
      const rows = await collection.limit(100).get();
      if (rows.empty) continue;
      if (!await stillOwnedGuest(source.ref, ownerId)) return { complete: false };
      const batch = db.batch(); rows.docs.forEach(row => batch.delete(row.ref)); await batch.commit(); return { complete: false };
    }
    if (!await stillOwnedGuest(source.ref, ownerId)) continue;
    await db.collection("sharedWishlists").doc(createHash("sha256").update(source.id).digest("hex")).delete();
    try { await auth.deleteUser(source.id); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found")) throw error; }
    await source.ref.delete();
    return { complete: false };
  }
  return { complete: false };
}
