"use client";
import { planningToken, plannerFetch } from "@/lib/firebase/planner-client";
import type { z } from "zod";
import type { clientEventSchema } from "./funnel";
const delivered = new Set<string>();
let memoryScope = "";
export function funnelScope(suffix = "") {
  try {
    const key = `date-atlas:funnel-scope:v1:${new URLSearchParams(window.location.search).get("flow") ?? "direct"}:${suffix}`;
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string" && "expiresAt" in raw && typeof raw.expiresAt === "number" && raw.expiresAt > Date.now()) return raw.id;
    const id = crypto.randomUUID(); sessionStorage.setItem(key, JSON.stringify({ id, expiresAt: Date.now() + 3600000 })); return id;
  } catch { memoryScope ||= crypto.randomUUID(); return memoryScope; }
}
export function trackFunnel(event: z.infer<typeof clientEventSchema>["event"], scope = funnelScope(), reason?: z.infer<typeof clientEventSchema>["reason"]) {
  const key = `${event}:${scope}`;
  if (delivered.has(key)) return;
  delivered.add(key);
  void planningToken().then(() => plannerFetch("/api/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, scope, reason }), keepalive: true })).then((response) => { if (!response.ok) delivered.delete(key); }).catch(() => delivered.delete(key));
}
export function trackInvitationOpened(token: string) {
  void fetch("/api/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "invitation_opened", token, scope: funnelScope() }), keepalive: true }).catch(() => {});
}
