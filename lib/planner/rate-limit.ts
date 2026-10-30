import "server-only";
import { createHmac } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "@/lib/firebase/server";
import { RequestError } from "./http";

export async function enforcePlannerLimit(request: Request, bucket: "planning" | "conversation" | "polling" | "telemetry" = "planning") {
  if (process.env.DATE_ATLAS_CATALOG_MODE === "demo") return;
  const secret = process.env.PLANNER_RATE_LIMIT_SECRET;
  if (!secret)
    throw new RequestError(
      "Planning is being configured. Please try again shortly.",
      503,
    );
  // Vercel overwrites this header. Other hosts must configure a trusted proxy.
  const ip =
    (process.env.DATE_ATLAS_FUNCTIONS === "1" || process.env.VERCEL === "1")
      ? request.headers.get(process.env.DATE_ATLAS_FUNCTIONS === "1" ? "x-atlas-client-ip" : "x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
      : "local";
  const key = createHmac("sha256", secret).update(bucket === "planning" ? ip : `${bucket}:${ip}`).digest("hex");
  const db = getDatabase();
  const ref = db.collection("plannerLimits").doc(key);
  await db.runTransaction(async (transaction) => {
    const record = await transaction.get(ref);
    const data = record.data();
    const now = Date.now();
    const current =
      data?.resetAt instanceof Timestamp && data.resetAt.toMillis() > now;
    const count = current && typeof data?.count === "number" ? data.count : 0;
    if (count >= ({ planning: 12, conversation: 30, polling: 120, telemetry: 120 })[bucket])
      throw new RequestError(
        "There have been several requests in a moment. Please wait one minute and try again.",
        429,
      );
    transaction.set(ref, {
      count: count + 1,
      resetAt: current ? data.resetAt : Timestamp.fromMillis(now + 60000),
      expiresAt: Timestamp.fromMillis(now + 86400000),
    });
  });
}
