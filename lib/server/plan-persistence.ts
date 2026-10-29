import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { authenticatedClient } from "@/lib/firebase/server";
import { savedDocumentId } from "@/lib/firebase/paths";
import { encodePlan, decodePlanRequest } from "@/lib/planner/money";
import { RequestError } from "@/lib/planner/http";
import type { DatePlan } from "@/lib/planner/schema";
export async function persistPlans(request: Request, plans: DatePlan[]) {
  if (!plans.length || process.env.DATE_ATLAS_CATALOG_MODE === "demo") return;
  const auth = await authenticatedClient(request);
  if (!auth) return;
  const parent = auth.db.collection("users").doc(auth.user.uid);
  const batch = auth.db.batch();
  for (const plan of plans) batch.set(parent.collection("datePlans").doc(savedDocumentId(plan.id)), {
    record: encodePlan(plan), updatedAt: FieldValue.serverTimestamp(),
    ...(auth.user.firebase.sign_in_provider === "anonymous" ? { expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) } : {}),
  });
  await batch.commit();
}
export async function ownedPlanRequest(request: Request, planId: string) {
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Please reopen this itinerary to continue.", 401);
  const record = await auth.db.collection("users").doc(auth.user.uid).collection("datePlans").doc(savedDocumentId(planId)).get();
  const parsed = decodePlanRequest(record.data()?.record);
  if (!parsed.success) throw new RequestError("This itinerary isn't available in your session. Reopen or regenerate it.", 404);
  return parsed.data;
}
