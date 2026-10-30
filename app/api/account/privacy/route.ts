import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { deletionKey } from "@/lib/server/account-privacy";
export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to manage your privacy requests.", 401);
    const row = await auth.db.collection("accountDeletionRequests").doc(deletionKey(auth.user.uid)).get();
    return Response.json({ status: row.data()?.status ?? "none" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to request account deletion.", 401);
    const parsed = z.object({ action: z.enum(["request", "cancel"]) }).safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Choose a privacy request action.", 400);
    await enforcePlannerLimit(request, "conversation");
    const ref = auth.db.collection("accountDeletionRequests").doc(deletionKey(auth.user.uid));
    await auth.db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (data?.status === "processing") throw new RequestError("Deletion has already started and can no longer be canceled here.", 409);
      if (parsed.data.action === "cancel") { tx.delete(ref); return; }
      if (data?.status === "requested") return;
      tx.set(ref, { targetUid: auth.user.uid, status: "requested", requestedAt: Timestamp.now() });
    });
    return Response.json({ status: parsed.data.action === "request" ? "requested" : "none" });
  } catch (error) { return apiError(error); }
}
