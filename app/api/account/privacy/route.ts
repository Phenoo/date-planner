import { createHash, randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { deletionKey, deletionWithdrawMs } from "@/lib/server/account-privacy";
const receiptPattern = /^[a-f0-9]{64}$/;
const receiptHash = (value: string) => createHash("sha256").update(value).digest("hex");
const statusData = (data?: Record<string, unknown>) => ({
  status: data?.status ?? "none",
  automatic: data?.automaticVersion === 1,
  processAfter: data?.processAfter instanceof Timestamp ? data.processAfter.toDate().toISOString() : null,
});
const statusResponse = (data?: Record<string, unknown>) => Response.json(statusData(data), { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const receipt = request.headers.get("x-deletion-receipt");
    if (receipt) {
      if (!receiptPattern.test(receipt)) throw new RequestError("Deletion receipt not found.", 404);
      await enforcePlannerLimit(request, "polling");
      const rows = await getDatabase().collection("accountDeletionRequests").where("receiptHash", "==", receiptHash(receipt)).limit(1).get();
      if (rows.empty) throw new RequestError("Deletion receipt not found.", 404);
      const data = rows.docs[0].data();
      if (data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() <= Date.now()) throw new RequestError("Deletion receipt has expired.", 404);
      return statusResponse(data);
    }
    const auth = await authenticatedClient(request);
    if (!auth) throw new RequestError("Open this page in the browser or app where you planned or signed in.", 401);
    const row = await auth.db.collection("accountDeletionRequests").doc(deletionKey(auth.user.uid)).get();
    return statusResponse(row.data());
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth) throw new RequestError("Open this page in the browser or app where you planned or signed in.", 401);
    const parsed = z.object({ action: z.enum(["request", "cancel"]), processing: z.literal("automatic-v1").optional() }).strict().safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Choose a privacy request action.", 400);
    const anonymous = auth.user.firebase.sign_in_provider === "anonymous";
    if (anonymous && parsed.data.processing !== "automatic-v1") throw new RequestError("Use the updated privacy controls to remove guest data.", 401);
    if (parsed.data.action === "request" && parsed.data.processing === "automatic-v1" && !anonymous && (typeof auth.user.auth_time !== "number" || auth.user.auth_time * 1000 < Date.now() - 10 * 60000)) throw new RequestError("Sign in again to confirm account deletion, then submit your request.", 401);
    await enforcePlannerLimit(request, "conversation");
    const ref = auth.db.collection("accountDeletionRequests").doc(deletionKey(auth.user.uid));
    const receipt = parsed.data.action === "request" && parsed.data.processing === "automatic-v1" ? randomBytes(32).toString("hex") : null;
    await auth.db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (data?.status === "processing" || data?.status === "complete") throw new RequestError("Deletion has already started and can no longer be canceled here.", 409);
      if (parsed.data.action === "cancel") { tx.delete(ref); return; }
      if (data?.status === "requested") {
        if (receipt && data.automaticVersion === 1) tx.update(ref, { receiptHash: receiptHash(receipt) });
        else if (receipt) throw new RequestError("Withdraw your existing reviewed request before submitting an automatic deletion request.", 409);
        return;
      }
      tx.set(ref, { targetUid: auth.user.uid, status: "requested", requestedAt: Timestamp.now(), ...(receipt ? {
        automaticVersion: 1, processAfter: Timestamp.fromMillis(Date.now() + deletionWithdrawMs), receiptHash: receiptHash(receipt),
        ...(auth.user.email_verified === true && typeof auth.user.email === "string" ? { confirmationEmail: auth.user.email } : {}),
      } : {}) });
    });
    const data = (await ref.get()).data();
    return Response.json({ ...statusData(data), ...(receipt ? { receipt } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
