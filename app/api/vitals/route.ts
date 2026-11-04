import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "@/lib/firebase/server";
import { webVitalSchema } from "@/lib/analytics/metrics";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new RequestError("Performance samples must come from this site.", 403);
    const sample = webVitalSchema.safeParse(await readJson(request));
    if (!sample.success) throw new RequestError("Invalid performance sample.", 400);
    await enforcePlannerLimit(request, "telemetry");
    const { id, ...value } = sample.data;
    const key = createHash("sha256").update(`${value.name}:${id}`).digest("hex");
    await getDatabase().collection("webVitals").doc(key).set({ ...value, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
    return Response.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
