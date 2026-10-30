import { Timestamp } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { dateFeedbackSchema } from "@/lib/planner/date-feedback";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Sign in to leave private date feedback.", 401);
    const parsed = dateFeedbackSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Confirm whether the date happened and complete the feedback fields.", 400);
    await enforcePlannerLimit(request, "conversation");
    const history = auth.db.collection("users").doc(auth.user.uid).collection("dateHistory").doc(parsed.data.dateId);
    await auth.db.runTransaction(async (tx) => {
      if (!(await tx.get(history)).exists) throw new RequestError("This date wasn't found in your account.", 404);
      tx.set(auth.db.collection("users").doc(auth.user.uid).collection("userFeedback").doc(parsed.data.dateId), { ...parsed.data, updatedAt: Timestamp.now(), publishConsent: false });
    });
    return Response.json({ saved: true });
  } catch (error) { return apiError(error); }
}
