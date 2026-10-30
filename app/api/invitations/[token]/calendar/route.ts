import { invitationTokenSchema, publicInvitationSchema } from "@/lib/planner/invitations";
import { dateCalendar } from "@/lib/planner/calendar";
import { plannerAction } from "@/lib/server/planner-gateway";
import { apiError, RequestError } from "@/lib/planner/http";
import { createHash } from "node:crypto";
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const token = invitationTokenSchema.parse((await params).token);
    const response = await plannerAction("invitations", new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ action: "read", token }), signal: request.signal }));
    if (!response.ok) return response;
    const date = publicInvitationSchema.parse(await response.json());
    let calendar: string;
    try { calendar = dateCalendar(date, createHash("sha256").update(token).digest("hex")); } catch { throw new RequestError("Choose a valid date and time before adding this date to a calendar.", 400); }
    return new Response(calendar, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="our-date.ics"', "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
