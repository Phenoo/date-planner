import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { requestSchema } from "@/lib/planner/schema";
import { dateStorySchema } from "@/lib/planner/date-story";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { refreshDiscoveryPick } from "@/lib/server/date-discovery";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth) throw new RequestError("Sign in to reopen your chosen date.", 401);
    const input = z.object({ sessionId: z.uuid(), placeId: z.string().min(1).max(200) }).safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Invalid date reference.", 400);
    await enforcePlannerLimit(request, "conversation");
    const data = (await auth.db.collection("users").doc(auth.user.uid).collection("discoverySessions").doc(input.data.sessionId).get()).data();
    if (!data || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) throw new RequestError("Your planning session expired. Reopen a saved date or plan again.", 410);
    const parsed = z.object({ privateRequest: requestSchema, candidates: z.array(z.object({ id: z.string(), distanceKm: z.number().nonnegative().default(0), story: dateStorySchema })) }).safeParse(data);
    const candidate = parsed.success ? parsed.data.candidates.find((place) => place.id === input.data.placeId) : null;
    if (!parsed.success || !candidate) throw new RequestError("This date isn't available in your account.", 404);
    const place = await refreshDiscoveryPick({ ...candidate, reason: "Chosen for your date preferences." }, parsed.data.privateRequest, true);
    return Response.json({ request: parsed.data.privateRequest, result: { nearby: { city: parsed.data.privateRequest.city, area: parsed.data.privateRequest.area, country: parsed.data.privateRequest.country, sessionId: input.data.sessionId, places: [place] }, plans: [], warnings: [], diagnostics: [], source: "firebase", ai: false } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
