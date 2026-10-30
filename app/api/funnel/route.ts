import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { clientEventSchema, funnelEvents } from "@/lib/planner/funnel";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { recordFunnel } from "@/lib/server/funnel";
import { invitationTokenSchema } from "@/lib/planner/invitations";
import { storedDateSchema, tokenKey } from "@/lib/server/date-invitations";

export async function POST(request: Request) {
  try {
    const raw: unknown = await readJson(request);
    await enforcePlannerLimit(request, "telemetry");
    const opened = z.object({ event: z.literal("invitation_opened"), token: invitationTokenSchema, scope: z.uuid() }).strict().safeParse(raw);
    if (opened.success) {
      const key = tokenKey(opened.data.token);
      const published = storedDateSchema.safeParse((await getDatabase().collection("dateInvitations").doc(key).get()).data());
      if (!published.success) throw new RequestError("Invitation unavailable.", 404);
      await recordFunnel(key, "invitation_opened", opened.data.scope);
    } else {
      const input = clientEventSchema.safeParse(raw);
      if (!input.success) throw new RequestError("Invalid event.", 400);
      const auth = await authenticatedClient(request);
      if (!auth || input.data.event === "authentication_completed" && auth.user.firebase.sign_in_provider === "anonymous") throw new RequestError("Session required.", 401);
      await recordFunnel(auth.user.uid, input.data.event, input.data.scope, input.data.reason);
    }
    return Response.json({ recorded: true });
  } catch (error) { return apiError(error); }
}
export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true) throw new RequestError("Admin access required.", 403);
    const counts = await Promise.all(funnelEvents.map(async (event) => ({ event, count: (await auth.db.collection("funnelEvents").where("event", "==", event).where("expiresAt", ">", Timestamp.now()).count().get()).data().count })));
    return Response.json({ counts, retentionDays: 30 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
