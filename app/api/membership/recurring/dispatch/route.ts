import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/planner/http";
import { membershipTestEnabled } from "@/lib/server/membership-config";
import { deliverRecurringDateNights, dispatchRecurringDateNights } from "@/lib/server/recurring-date-night";

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!membershipTestEnabled() || !secret) return new Response(null, { status: 404 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  try {
    const prepared = await dispatchRecurringDateNights().catch(() => null);
    const handled = await deliverRecurringDateNights();
    if (prepared === null) throw new Error("Some recurring date nights could not be prepared.");
    return Response.json({ prepared, handled }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
