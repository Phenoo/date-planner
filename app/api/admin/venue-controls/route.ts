import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { venueAdminInputSchema, venueControlSchema } from "@/lib/planner/venue-control";
export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true) throw new RequestError("Admin access required.", 403);
    const [controls, reports] = await Promise.all([
      auth.db.collection("venueControls").get(),
      auth.db.collection("venueReports").where("resolved", "==", false).orderBy("createdAt", "desc").limit(50).get(),
    ]);
    return Response.json({ controls: controls.docs.map((row) => venueControlSchema.parse(row.data())), reports: reports.docs.map((row) => ({ id: row.id, placeId: row.data().placeId, reason: row.data().reason, createdAt: row.data().createdAt.toDate().toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true) throw new RequestError("Admin access required.", 403);
    const input = venueAdminInputSchema.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Check the venue ID, source and verification date.", 400);
    if (input.data.action === "resolve") {
      const ref = auth.db.collection("venueReports").doc(input.data.id);
      if (!(await ref.get()).exists) throw new RequestError("Report not found.", 404);
      await ref.update({ resolved: true, resolvedAt: FieldValue.serverTimestamp(), resolvedBy: auth.user.uid });
    } else {
      const control = venueControlSchema.parse(input.data);
      if (control.verifiedAt > new Date().toISOString().slice(0, 10)) throw new RequestError("Verification cannot be in the future.", 400);
      await auth.db.collection("venueControls").doc(createHash("sha256").update(control.placeId).digest("hex")).set({ ...control, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.user.uid });
    }
    return Response.json({ saved: true });
  } catch (error) { return apiError(error); }
}
