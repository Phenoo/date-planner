import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { authenticatedClient, getFirebaseAdmin } from "@/lib/firebase/server";
import { apiError, readJson } from "@/lib/planner/http";
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.firebase.sign_in_provider === "anonymous") return Response.json({ error: "Sign in to your permanent account first." }, { status: 401 });
    const body = z.object({ guestToken: z.string().min(10).max(10000) }).safeParse(await readJson(request));
    if (!body.success) return Response.json({ error: "Invalid guest session." }, { status: 400 });
    const guest = await getAuth(getFirebaseAdmin()).verifyIdToken(body.data.guestToken, true);
    if (guest.firebase.sign_in_provider !== "anonymous" || guest.uid === auth.user.uid) return Response.json({ error: "Only your authenticated guest session can be transferred." }, { status: 403 });
    const source = auth.db.collection("users").doc(guest.uid), destination = auth.db.collection("users").doc(auth.user.uid);
    for (const collection of ["savedPlans", "datePlans", "discoverySessions", "dateHistory"]) {
      const records = await source.collection(collection).limit(100).get();
      for (const record of records.docs) await auth.db.runTransaction(async (tx) => {
        const target = destination.collection(collection).doc(record.id);
        const existing = await tx.get(target);
        const data = record.data();
        const invitation = collection === "dateHistory" && typeof data.invitationKey === "string" && /^[a-f0-9]{64}$/.test(data.invitationKey) ? auth.db.collection("dateInvitations").doc(data.invitationKey) : null;
        const linked = invitation ? await tx.get(invitation) : null;
        const { expiresAt: _expiresAt, ...permanent } = data;
        void _expiresAt;
        if (!existing.exists) tx.set(target, permanent);
        if (invitation && linked?.data()?.ownerId === guest.uid) tx.update(invitation, { ownerId: auth.user.uid });
      });
    }
    return Response.json({ merged: true });
  } catch (error) { return apiError(error); }
}
