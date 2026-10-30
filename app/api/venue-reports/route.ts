import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { venueReportSchema } from "@/lib/planner/venue-control";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { getCatalog } from "@/lib/planner/catalog";
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth) throw new RequestError("Reopen your date to report these details.", 401);
    const parsed = venueReportSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Choose which detail needs checking.", 400);
    const input = parsed.data;
    if (input.sessionId) {
      const data = (await auth.db.collection("users").doc(auth.user.uid).collection("discoverySessions").doc(input.sessionId).get()).data();
      if (!Array.isArray(data?.candidates) || !data.candidates.some((candidate: unknown) => candidate && typeof candidate === "object" && "id" in candidate && candidate.id === input.placeId)) throw new RequestError("This place isn't in your planning session.", 404);
    } else if (!(await getCatalog()).some((item) => item.id === input.placeId && !item.demo)) throw new RequestError("This experience isn't available to report.", 404);
    await enforcePlannerLimit(request, "conversation");
    const id = createHash("sha256").update(`${auth.user.uid}:${input.placeId}:${input.reason}:${new Date().toISOString().slice(0, 10)}`).digest("hex");
    const ref = auth.db.collection("venueReports").doc(id);
    await auth.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      tx.create(ref, { placeId: input.placeId, reason: input.reason, resolved: false, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
    });
    return Response.json({ reported: true });
  } catch (error) { return apiError(error); }
}
