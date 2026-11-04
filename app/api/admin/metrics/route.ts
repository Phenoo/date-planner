import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, RequestError } from "@/lib/planner/http";
import { summarizeJourneys, summarizeWebVitals, webVitalSchema } from "@/lib/analytics/metrics";
import { funnelEvents, clientEventSchema } from "@/lib/planner/funnel";

const storedJourney = z.object({ event: z.enum(funnelEvents), journey: z.string().regex(/^[a-f0-9]{64}$/), step: clientEventSchema.shape.step, createdAt: z.instanceof(Timestamp), expiresAt: z.instanceof(Timestamp) });
const storedVital = z.object({ ...webVitalSchema.shape, createdAt: z.instanceof(Timestamp), expiresAt: z.instanceof(Timestamp) });
export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true) throw new RequestError("Admin access required.", 403);
    const [events, metrics] = await Promise.all([auth.db.collection("funnelEvents").orderBy("createdAt", "desc").limit(1501).get(), auth.db.collection("webVitals").orderBy("createdAt", "desc").limit(1501).get()]);
    const now = Date.now();
    const journeys = events.docs.slice(0, 1500).flatMap((doc) => {
      const record = storedJourney.safeParse(doc.data());
      return record.success && record.data.expiresAt.toMillis() > now ? [{ event: record.data.event, journey: record.data.journey, step: record.data.step, createdAt: record.data.createdAt.toMillis() }] : [];
    });
    const vitals = metrics.docs.slice(0, 1500).flatMap((doc) => {
      const record = storedVital.safeParse({ ...doc.data(), id: doc.id });
      return record.success && record.data.expiresAt.toMillis() > now ? [record.data] : [];
    });
    return Response.json({ retentionDays: 30, sampled: events.size > 1500 || metrics.size > 1500, journeys: summarizeJourneys(journeys, now), vitals: summarizeWebVitals(vitals) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
