import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { RequestError } from "@/lib/planner/http";
import { datePlanSchema, recommendationResultSchema } from "@/lib/planner/response-schema";
import { dateStorySchema } from "@/lib/planner/date-story";
import type { GenerateInput, RecommendationResult } from "@/lib/planner/schema";
import { venueControls } from "./venue-controls";
import { getCatalog } from "@/lib/planner/catalog";
import { recalculateExactPlan } from "@/lib/planner/engine";
import { refreshDiscoveryPick } from "./date-discovery";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

import { recordFunnel } from "./funnel";

const lifetime = 10 * 60 * 1000;
const leaseMs = 90000;
const cachedSchema = recommendationResultSchema.omit({ plans: true, nearby: true }).extend({
  plans: z.array(datePlanSchema.omit({ request: true })).max(1),
  nearby: z.object({ sessionId: z.uuid().optional(), ai: z.boolean().optional(), headline: z.string().optional(), introduction: z.string().optional(), warnings: z.array(z.string()).optional(),
    picks: z.array(z.object({ id: z.string(), distanceKm: z.number(), reason: z.string(), story: dateStorySchema.optional() })).max(1),
  }).optional(),
});
function cacheResult(result: RecommendationResult) {
  return cachedSchema.parse(JSON.parse(JSON.stringify({ ...result, plans: result.plans.map(({ request: _request, ...plan }) => { void _request; return plan; }),
    nearby: result.nearby ? { ...result.nearby, picks: result.nearby.places.map(({ id, distanceKm, reason, story }) => ({ id, distanceKm, reason, ...(story ? { story } : {}) })) } : undefined,
  })));
}
async function restoreResult(value: z.infer<typeof cachedSchema>, input: GenerateInput): Promise<RecommendationResult> {
  const { nearby: cached, ...rest } = value;
  const controls = await venueControls();
  const catalog = rest.plans.length ? await getCatalog() : [];
  const plans = rest.plans.map((plan) => {
    const experiences = plan.activities.map((activity) => catalog.find((item) => item.id === activity.experience.id));
    const current = experiences.every((experience) => experience !== undefined) ? recalculateExactPlan(input.request, experiences, undefined, catalog) : null;
    if (!current) throw new RequestError("This date no longer fits current venue information. Request another recommendation.", 409);
    return { ...current, title: plan.title, introduction: plan.introduction };
  });
  if (plans.some((plan) => plan.activities.some((activity) => controls.has(activity.experience.id)))) throw new RequestError("This place is under review. Request another recommendation.", 409);
  if (!cached) return { ...rest, plans };
  const places = await Promise.all(cached.picks.map(async (pick) => {
    if (controls.has(pick.id)) throw new RequestError("This place is under review. Request another recommendation.", 409);
    return refreshDiscoveryPick(pick, input.request, true);
  }));
  const { picks: _picks, ...metadata } = cached; void _picks;
  return { ...rest, plans, nearby: { ...metadata, city: input.request.city, area: input.request.area, country: input.request.country, places } };
}

export async function coordinateGeneration(request: Request, input: GenerateInput, run: (signal: AbortSignal) => Promise<RecommendationResult>): Promise<Response> {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)]);
  if (process.env.DATE_ATLAS_CATALOG_MODE === "demo") return Response.json(await run(signal), { headers: { "Cache-Control": "no-store" } });
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Your guest session expired. Please retry planning.", 401);
  await enforcePlannerLimit(request, "polling");
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const suppliedKey = request.headers.get("idempotency-key");
  if (suppliedKey && !z.uuid().safeParse(suppliedKey).success) throw new RequestError("Invalid planning request. Please retry.", 400);
  const key = suppliedKey ?? `automatic:${Math.floor(Date.now() / 60000)}:${payloadHash}`;
  const ref = auth.db.collection("users").doc(auth.user.uid).collection("generationRequests").doc(createHash("sha256").update(key).digest("hex"));
  const attempt = randomUUID();
  const claim = await auth.db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const now = Date.now();
    const current = data?.expiresAt instanceof Timestamp && data.expiresAt.toMillis() > now;
    if (current && data.payloadHash !== payloadHash) throw new RequestError("This retry has different answers. Start a fresh planning request.", 409);
    const cached = current && data.status === "complete" ? cachedSchema.safeParse(data.result) : null;
    if (cached?.success) return { state: "complete" as const, result: cached.data };
    if (current && data.status === "running" && data.leaseUntil instanceof Timestamp && data.leaseUntil.toMillis() > now) return { state: "pending" as const };
    tx.set(ref, { payloadHash, attempt, status: "running", leaseUntil: Timestamp.fromMillis(now + leaseMs), expiresAt: Timestamp.fromMillis(now + lifetime) });
    return { state: "claimed" as const };
  });
  if (claim.state === "pending") return Response.json({ pending: true }, { status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2" } });
  if (claim.state === "complete") return Response.json(await restoreResult(claim.result, input), { headers: { "Cache-Control": "no-store" } });
  try {
    await recordFunnel(auth.user.uid, "planner_completed", input.flowId ?? key);
    const result = await run(signal);
    signal.throwIfAborted();
    const cached = cacheResult(result);
    await auth.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).data()?.attempt !== attempt) throw new RequestError("This planning attempt expired. Please retry.", 409);
      tx.update(ref, { status: "complete", result: cached, leaseUntil: Timestamp.fromMillis(0) });
    });
    await recordFunnel(auth.user.uid, result.plans.length || result.nearby?.places.length ? "recommendation_succeeded" : "recommendation_failed", key);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await recordFunnel(auth.user.uid, "recommendation_failed", key);
    await auth.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).data()?.attempt === attempt) tx.update(ref, { status: "failed", leaseUntil: Timestamp.fromMillis(0) });
    }).catch(() => { console.warn("Planning lease cleanup failed; the lease will expire."); });
    throw error;
  }
}
