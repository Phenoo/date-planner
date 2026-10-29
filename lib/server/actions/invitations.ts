import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { invitationInputSchema, nextInvitationResponse } from "@/lib/planner/invitations";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { createChosenDate, readDateInvitation, storedDateSchema, tokenKey } from "@/lib/server/date-invitations";
import { z } from "zod";

export async function invitations(request: Request) {
  try {
    const parsed = invitationInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Please check this invitation and try again.", 400);
    await enforcePlannerLimit(request);
    const input = parsed.data;
    if (input.action === "create") return Response.json(await createChosenDate(request, input.sessionId, input.placeId), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "read") return Response.json(await readDateInvitation(input.token), { headers: { "Cache-Control": "no-store" } });
    const db = getDatabase();
    const ref = db.collection("dateInvitations").doc(tokenKey(input.token));
    const response = await db.runTransaction(async (tx) => {
      const row = await tx.get(ref);
      const parsed = storedDateSchema.extend({ ownerId: z.string().min(1).max(128), selectionId: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(row.data());
      if (!parsed.success) throw new RequestError("This invitation couldn't be found. Ask for a new link.", 404);
      const next = nextInvitationResponse(parsed.data.response, input.response);
      if (!next) throw new RequestError("This invitation already has a response.", 409);
      if (parsed.data.response !== "pending") return next;
      if (parsed.data.dateStatus === "completed") throw new RequestError("This date has already been marked as done.", 409);
      const history = db.collection("users").doc(parsed.data.ownerId).collection("dateHistory").doc(parsed.data.selectionId);
      const ownerRecord = await tx.get(history);
      tx.update(ref, { response: next, respondedAt: Timestamp.now() });
      if (ownerRecord.exists) tx.update(history, { response: next, respondedAt: Timestamp.now() });
      return next;
    });
    return Response.json({ response }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
