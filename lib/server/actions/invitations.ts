import { authenticatedClient } from "@/lib/firebase/server";
import { recordFunnel } from "@/lib/server/funnel";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { invitationInputSchema, nextInvitationResponse } from "@/lib/planner/invitations";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { createCatalogInvitation, createChosenDate, readChosenSelection, revokeDateInvitation, readDateInvitation, storedDateSchema, tokenKey } from "@/lib/server/date-invitations";
import { z } from "zod";
import { scheduleError } from "@/lib/planner/schedule";
import { calendarInstant } from "@/lib/planner/calendar";
import { deletionKey } from "@/lib/server/account-privacy";

export async function invitations(request: Request) {
  try {
    const parsed = invitationInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Please check this invitation and try again.", 400);
    await enforcePlannerLimit(request);
    const input = parsed.data;
    if (input.action === "catalog" || input.action === "create" || input.action === "save") {
      const result = input.action === "catalog" ? await createCatalogInvitation(request, input.recipe) : await createChosenDate(request, input.sessionId, input.placeId, input.action === "create");
      const auth = await authenticatedClient(request);
      if (auth) {
        await recordFunnel(auth.user.uid, "plan_saved", result.id);
        if (input.action !== "save") await recordFunnel(auth.user.uid, "invitation_created", tokenKey(result.token));
      }
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "selection") return Response.json(await readChosenSelection(request, input.sessionId, input.placeId), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "revoke") return Response.json(await revokeDateInvitation(request, input.id), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "read") return Response.json(await readDateInvitation(input.token), { headers: { "Cache-Control": "no-store" } });
    const db = getDatabase();
    const ref = db.collection("dateInvitations").doc(tokenKey(input.token));
    const response = await db.runTransaction(async (tx) => {
      const row = await tx.get(ref);
      const parsed = storedDateSchema.extend({ ownerId: z.string().min(1).max(128), selectionId: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(row.data());
      if (!parsed.success) throw new RequestError("This invitation couldn't be found. Ask for a new link.", 404);
      const deletion = (await tx.get(db.collection("accountDeletionRequests").doc(deletionKey(parsed.data.ownerId)))).data();
      if (deletion?.status === "processing" || deletion?.status === "complete") throw new RequestError("This invitation is no longer available.", 404);
      if (input.action === "suggest") {
        if (parsed.data.response !== "pending" || parsed.data.dateStatus === "completed") throw new RequestError("This invitation already has a response.", 409);
        if (input.timeZone !== parsed.data.timeZone) throw new RequestError("Use the timezone shown on this invitation.", 400);
        const invalid = scheduleError({ ...parsed.data, date: input.date, startTime: input.startTime });
        if (invalid) throw new RequestError(invalid, 400);
        try { calendarInstant(input.date, input.startTime, input.timeZone); } catch { throw new RequestError("Choose a valid local time.", 400); }
        const suggestedTime = { date: input.date, startTime: input.startTime, timeZone: input.timeZone };
        if (parsed.data.suggestedTime) {
          if (JSON.stringify(parsed.data.suggestedTime) !== JSON.stringify(suggestedTime)) throw new RequestError("A time has already been suggested. Ask the creator to update the invitation.", 409);
          return { suggestedTime };
        }
        const history = db.collection("users").doc(parsed.data.ownerId).collection("dateHistory").doc(parsed.data.selectionId);
        const ownerRecord = await tx.get(history);
        tx.update(ref, { suggestedTime, respondedAt: Timestamp.now() });
        if (ownerRecord.exists) tx.update(history, { suggestedTime, respondedAt: Timestamp.now() });
        return { suggestedTime };
      }
      if (parsed.data.suggestedTime) throw new RequestError("A different time has been suggested. Wait for an updated invitation.", 409);
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
    return Response.json(typeof response === "string" ? { response } : response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
