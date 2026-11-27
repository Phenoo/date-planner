import "server-only";
import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { savedDocumentId } from "@/lib/firebase/paths";
import { membershipLimits, membershipPeriod, membershipRecordSchema } from "@/lib/membership/schema";
import { decodeRecipe } from "@/lib/planner/money";
import { RequestError } from "@/lib/planner/http";
import { contextExpired } from "./context-retention";
import { membershipTestEnabled } from "./membership-config";

export type MembershipUsageKind = "plans" | "changes";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const holdSchema = z.object({ kind: z.enum(["plans", "changes"]), attempt: z.string(), until: z.number() });
const usageSchema = z.object({
  plans: z.number().int().nonnegative().default(0),
  changes: z.number().int().nonnegative().default(0),
  holds: z.record(z.string(), holdSchema).default({}),
});
type Usage = z.infer<typeof usageSchema>;
type Period = ReturnType<typeof membershipPeriod>;
export type UsageReservation = { receiptId: string; periodId: string; attempt: string; kind: MembershipUsageKind; payloadHash: string };
const receiptSchema = z.object({
  status: z.enum(["pending", "failed", "consumed"]),
  periodId: z.string(), attempt: z.string(), kind: z.enum(["plans", "changes"]), payloadHash: z.string(),
});

function readUsage(value: unknown): Usage {
  const parsed = usageSchema.safeParse(value ?? {});
  if (!parsed.success) throw new RequestError("Your planning allowance couldn't be checked. Please try again.", 503);
  return parsed.data;
}
function readPeriod(value: unknown, now: number) {
  if (value === undefined) return membershipPeriod(null, now);
  const parsed = membershipRecordSchema.safeParse(value);
  if (!parsed.success) throw new RequestError("Your membership couldn't be checked. Please try again.", 503);
  return membershipPeriod(parsed.data, now);
}
function periodId(period: Period) { return digest(`${period.tier}:${period.periodStart}:${period.periodEnd}`); }
function activeHolds(usage: Usage, now: number) {
  return Object.fromEntries(Object.entries(usage.holds).filter(([, hold]) => hold.until > now));
}
function allowance(usage: Usage, period: Period, kind: MembershipUsageKind, now: number) {
  const limit = membershipLimits[period.tier][kind];
  if (limit === null) return { limit, used: usage[kind], remaining: null };
  const held = Object.values(activeHolds(usage, now)).filter((hold) => hold.kind === kind).length;
  return { limit, used: usage[kind], remaining: Math.max(0, limit - usage[kind] - held) };
}

export async function getMembershipUsageSnapshot(db: Firestore, uid: string, now = Date.now()) {
  return db.runTransaction(async (tx) => {
    const user = db.collection("users").doc(uid);
    const period = readPeriod((await tx.get(user.collection("membership").doc("current"))).data(), now);
    const usage = readUsage((await tx.get(user.collection("membershipUsage").doc(periodId(period)))).data());
    return { ...period, plans: allowance(usage, period, "plans", now), changes: allowance(usage, period, "changes", now) };
  });
}

// Reserve in the same transaction as the generation lease, so concurrent tabs cannot overspend.
export async function reserveMembershipUsage(tx: Transaction, db: Firestore, uid: string, key: string, payloadHash: string, attempt: string, kind: MembershipUsageKind, until: number, now = Date.now()): Promise<UsageReservation> {
  const user = db.collection("users").doc(uid);
  const owner = (await tx.get(user)).data();
  if (owner?.transferredTo) throw new RequestError("This guest date moved to your account. Sign in again to continue.", 401);
  const period = readPeriod((await tx.get(user.collection("membership").doc("current"))).data(), now);
  const receiptId = digest(key);
  const receiptRef = user.collection("membershipReceipts").doc(receiptId);
  const previous = (await tx.get(receiptRef)).data();
  const oldReceipt = receiptSchema.safeParse(previous);
  if (previous && !oldReceipt.success) throw new RequestError("This planning request couldn't be checked. Please try again.", 503);
  if (oldReceipt.success && oldReceipt.data.payloadHash !== payloadHash) throw new RequestError("This retry has different answers. Start a fresh planning request.", 409);
  if (oldReceipt.success && oldReceipt.data.status === "consumed") throw new RequestError("This date was already prepared. Reopen your existing date to continue without using another plan.", 409);
  const id = periodId(period);
  const usageRef = user.collection("membershipUsage").doc(id);
  const usage = readUsage((await tx.get(usageRef)).data());
  const holds = activeHolds(usage, now);
  delete holds[receiptId];
  if (allowance({ ...usage, holds }, period, kind, now).remaining === 0) {
    throw new RequestError(kind === "changes" ? "Venue changes are available with Plus. Your current date is still here." : "You've used your date plans for this month. Your saved dates are still here. See Membership for your allowance.", 402);
  }
  const reservation: UsageReservation = { receiptId, periodId: id, attempt, kind, payloadHash };
  holds[receiptId] = { kind, attempt, until };
  tx.set(usageRef, { ...usage, holds, periodStart: period.periodStart, periodEnd: period.periodEnd });
  tx.set(receiptRef, { ...reservation, status: "pending" });
  return reservation;
}

export async function settleMembershipUsage(tx: Transaction, db: Firestore, uid: string, reservation: UsageReservation, success: boolean) {
  const user = db.collection("users").doc(uid);
  const receiptRef = user.collection("membershipReceipts").doc(reservation.receiptId);
  const receipt = receiptSchema.safeParse((await tx.get(receiptRef)).data());
  if (!receipt.success) {
    if (success) throw new RequestError("This planning request couldn't be checked. Please try again.", 503);
    return;
  }
  if (receipt.data.attempt !== reservation.attempt || receipt.data.status !== "pending") return;
  const usageRef = user.collection("membershipUsage").doc(reservation.periodId);
  const usage = readUsage((await tx.get(usageRef)).data());
  const holds = { ...usage.holds };
  const hold = holds[reservation.receiptId];
  if (success && (!hold || hold.attempt !== reservation.attempt || hold.until <= Date.now())) throw new RequestError("This planning attempt expired. Please retry.", 409);
  delete holds[reservation.receiptId];
  tx.set(usageRef, { ...usage, [reservation.kind]: usage[reservation.kind] + (success ? 1 : 0), holds }, { merge: true });
  tx.set(receiptRef, { ...reservation, status: success ? "consumed" : "failed" });
}

export async function ownedMembershipContext(request: Request, reference: { kind: "plan" | "discovery"; id: string }) {
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Please sign in again to continue this date.", 401);
  const user = auth.db.collection("users").doc(auth.user.uid);
  if (reference.kind === "discovery") {
    if (!z.uuid().safeParse(reference.id).success) throw new RequestError("Reopen the place you want to change.", 400);
    const record = (await user.collection("discoverySessions").doc(reference.id).get()).data();
    if (!record || contextExpired(record)) throw new RequestError("Reopen your date before asking for another place.", 409);
    const candidates = z.array(z.object({ id: z.string() })).safeParse(record.candidates);
    if (!candidates.success) throw new RequestError("Reopen the place you want to change.", 409);
    return candidates.data.map((item) => item.id);
  }
  const [current, saved] = await Promise.all([
    user.collection("datePlans").doc(savedDocumentId(reference.id)).get(),
    user.collection("savedPlans").doc(savedDocumentId(reference.id)).get(),
  ]);
  const recipe = decodeRecipe(saved.data()?.recipe);
  if (recipe.success) return recipe.data.experienceIds;
  const data = current.data();
  const plan = z.object({ id: z.string(), activities: z.array(z.object({ experience: z.object({ id: z.string() }) })) }).safeParse(data?.record);
  if (!data || contextExpired(data) || !plan.success || plan.data.id !== reference.id) throw new RequestError("Reopen your date before changing its details.", 409);
  return plan.data.activities.map((item) => item.experience.id);
}

export async function requireOwnedActivities(request: Request, planId: string | undefined, ids: string[]) {
  if (!membershipTestEnabled()) return;
  if (!planId) throw new RequestError("Reopen this date before changing its details.", 409);
  const owned = await ownedMembershipContext(request, { kind: "plan", id: planId });
  if (ids.length !== owned.length || ids.some((id) => !owned.includes(id))) throw new RequestError("Choose activities from your existing date, or request another place.", 403);
}

export async function transferMembershipUsage(tx: Transaction, db: Firestore, sourceUid: string, destinationUid: string, now = Date.now()) {
  if (!membershipTestEnabled()) return;
  const source = db.collection("users").doc(sourceUid);
  const destination = db.collection("users").doc(destinationUid);
  const marker = destination.collection("membershipTransfers").doc(digest(sourceUid));
  if ((await tx.get(marker)).exists) return;
  const sourcePeriod = readPeriod((await tx.get(source.collection("membership").doc("current"))).data(), now);
  const targetPeriod = readPeriod((await tx.get(destination.collection("membership").doc("current"))).data(), now);
  const sourceId = periodId(sourcePeriod);
  const sourceUsage = readUsage((await tx.get(source.collection("membershipUsage").doc(sourceId))).data());
  const targetRef = destination.collection("membershipUsage").doc(periodId(targetPeriod));
  const targetUsage = readUsage((await tx.get(targetRef)).data());
  if (Object.keys(activeHolds(sourceUsage, now)).length) throw new RequestError("Your guest date is still being prepared. Please finish sign-in again shortly; your answers are kept.", 409);
  const receipts = await tx.get(source.collection("membershipReceipts").where("periodId", "==", sourceId).where("status", "==", "consumed").limit(50));
  const targets = receipts.docs.map((row) => destination.collection("membershipReceipts").doc(row.id));
  const existing = targets.length ? await tx.getAll(...targets) : [];
  tx.set(targetRef, { ...targetUsage, plans: targetUsage.plans + sourceUsage.plans, changes: targetUsage.changes + sourceUsage.changes, periodStart: targetPeriod.periodStart, periodEnd: targetPeriod.periodEnd });
  receipts.docs.forEach((row, index) => {
    const receipt = receiptSchema.safeParse(row.data());
    if (receipt.success && receipt.data.status === "consumed" && !existing[index].exists) tx.set(targets[index], receipt.data);
  });
  tx.set(marker, { transferredAt: now });
}
