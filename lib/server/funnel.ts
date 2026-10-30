import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "@/lib/firebase/server";
import type { FunnelEvent } from "@/lib/planner/funnel";

export async function recordFunnel(identity: string, event: FunnelEvent, scope: string, reason?: "place" | "distance" | "activity") {
  if (process.env.DATE_ATLAS_CATALOG_MODE === "demo") return;
  try {
    const id = createHash("sha256").update(`${identity}:${event}:${scope}`).digest("hex");
    await getDatabase().collection("funnelEvents").doc(id).create({ event, ...(reason ? { reason } : {}), createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === 6)) console.warn("Funnel event could not be recorded", { event });
  }
}
