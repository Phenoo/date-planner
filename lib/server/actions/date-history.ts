import { Timestamp } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { historyInputSchema } from "@/lib/planner/invitations";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { listChosenDates, storedDateSchema } from "@/lib/server/date-invitations";

export async function dateHistory(request: Request) {
  try {
    const parsed = historyInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Please check this date and try again.", 400);
    await enforcePlannerLimit(request);
    const input = parsed.data;
    if (input.action === "list") return Response.json(await listChosenDates(request, input.cursor, input.status), { headers: { "Cache-Control": "no-store" } });
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to keep your completed dates.", 401);
    const ref = auth.db.collection("users").doc(auth.user.uid).collection("dateHistory").doc(input.id);
    await auth.db.runTransaction(async (tx) => {
      const record = storedDateSchema.safeParse((await tx.get(ref)).data());
      if (!record.success) throw new RequestError("This date couldn't be found in your account.", 404);
      if (record.data.dateStatus === "completed") return;
      tx.update(ref, { dateStatus: "completed", completedAt: Timestamp.now() });
      tx.update(auth.db.collection("dateInvitations").doc(record.data.invitationKey), { dateStatus: "completed" });
    });
    return Response.json({ completed: true });
  } catch (error) { return apiError(error); }
}
