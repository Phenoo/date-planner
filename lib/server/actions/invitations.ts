import { authenticatedClient } from "@/lib/firebase/server";
import { recordFunnel } from "@/lib/server/funnel";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { invitationInputSchema, nextInvitationResponse, type InvitationReplyResult } from "@/lib/planner/invitations";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { createCatalogInvitation, createChosenDate, readChosenSelection, revokeDateInvitation, updateInvitationMessage, readDateInvitation, storedDateSchema, tokenKey } from "@/lib/server/date-invitations";
import { z } from "zod";
import { scheduleError } from "@/lib/planner/schedule";
import { calendarInstant } from "@/lib/planner/calendar";
import { deletionKey } from "@/lib/server/account-privacy";
import { queueInvitationReplyEmail } from "@/lib/server/date-email-outbox";

export async function invitations(request: Request) {
  try {
    const parsed = invitationInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Please check this invitation and try again.", 400);
    await enforcePlannerLimit(request);
    const input = parsed.data;
    if (input.action === "catalog" || input.action === "create" || input.action === "save") {
      const result = input.action === "catalog"
        ? await createCatalogInvitation(request, input.recipe, input.inviterName)
        : await createChosenDate(request, input.sessionId, input.placeId, input.action === "create", input.action === "create" ? input.inviterName : undefined);
      const auth = await authenticatedClient(request);
      if (auth) {
        await recordFunnel(auth.user.uid, "plan_saved", result.id, undefined, input.flowScope);
        if (input.action !== "save") await recordFunnel(auth.user.uid, "invitation_created", tokenKey(result.token), undefined, input.flowScope);
      }
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "selection") return Response.json(await readChosenSelection(request, input.sessionId, input.placeId), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "revoke") return Response.json(await revokeDateInvitation(request, input.id), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "message") return Response.json(await updateInvitationMessage(request, input.id, input.message), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "read") return Response.json(await readDateInvitation(input.token), { headers: { "Cache-Control": "no-store" } });
    const db = getDatabase();
    const ref = db.collection("dateInvitations").doc(tokenKey(input.token));
    const reply = await db.runTransaction(async (tx): Promise<InvitationReplyResult> => {
      const row = await tx.get(ref);
      const parsed = storedDateSchema.extend({ ownerId: z.string().min(1).max(128), selectionId: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(row.data());
      if (!parsed.success) throw new RequestError("This invitation couldn't be found. Ask for a new link.", 404);
      const record = parsed.data;
      const deletion = (await tx.get(db.collection("accountDeletionRequests").doc(deletionKey(record.ownerId)))).data();
      if (deletion?.status === "processing" || deletion?.status === "complete") throw new RequestError("This invitation is no longer available.", 404);
      let changes: InvitationReplyResult;
      if (input.action === "reply") {
        const response = nextInvitationResponse(record.response, input.response);
        if (!response) throw new RequestError("This invitation already has a response.", 409);
        if (record.response === response) return { response };
        changes = { response };
      } else {
        if (record.response !== "pending") throw new RequestError("This invitation already has a response.", 409);
        if (input.action === "suggest-vibe") {
          if (record.suggestedVibe === input.vibe) return { suggestedVibe: input.vibe };
          changes = { suggestedVibe: input.vibe };
        } else {
          if (input.timeZone !== record.timeZone) throw new RequestError("Use the time zone shown on this invitation.", 400);
          const { date, startTime, timeZone } = input;
          if (record.suggestedTime?.date === date && record.suggestedTime.startTime === startTime && record.suggestedTime.timeZone === timeZone) return { suggestedTime: record.suggestedTime };
          changes = { suggestedTime: { date, startTime, timeZone } };
        }
      }
      if (record.dateStatus === "completed") throw new RequestError("This date has already been marked as done.", 409);
      if (record.suggestedTime || record.suggestedVibe) throw new RequestError("A change has already been suggested. Wait for an updated invitation.", 409);
      if ("suggestedTime" in changes) {
        const { date, startTime, timeZone } = changes.suggestedTime;
        const invalid = scheduleError({ ...record, date, startTime });
        if (invalid) throw new RequestError(invalid, 400);
        try { calendarInstant(date, startTime, timeZone); } catch { throw new RequestError("Choose a valid local time.", 400); }
      }
      const user = db.collection("users").doc(record.ownerId);
      const history = user.collection("dateHistory").doc(record.selectionId);
      const ownerRecord = await tx.get(history);
      const update = { ...changes, respondedAt: Timestamp.now() };
      tx.update(ref, update);
      if (ownerRecord.get("invitationKey") === ref.id) {
        tx.update(history, update);
        queueInvitationReplyEmail(tx, user, { dateId: record.selectionId, invitationKey: ref.id, source: record.source });
      }
      return changes;
    });
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
