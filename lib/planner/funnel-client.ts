"use client";
import { planningToken, plannerFetch } from "@/lib/firebase/planner-client";
import type { z } from "zod";
import type { clientEventSchema } from "./funnel";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
const delivered = new Set<string>();
const memoryScopes = new Map<string, string>();
export function funnelScope(suffix = "") {
  const key = `date-atlas:funnel-scope:v1:${new URLSearchParams(window.location.search).get("flow") ?? "direct"}:${suffix}`;
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string" && "expiresAt" in raw && typeof raw.expiresAt === "number" && raw.expiresAt > Date.now()) return raw.id;
    const id = crypto.randomUUID(); sessionStorage.setItem(key, JSON.stringify({ id, expiresAt: Date.now() + 3600000 })); return id;
  } catch { const existing = memoryScopes.get(key); if (existing) return existing; const id = crypto.randomUUID(); memoryScopes.set(key, id); return id; }
}
export function trackFunnel(event: z.infer<typeof clientEventSchema>["event"], scope = funnelScope(), reason?: z.infer<typeof clientEventSchema>["reason"], step?: z.infer<typeof clientEventSchema>["step"]) {
  const flowScope = funnelScope();
  const key = `${event}:${scope}`;
  if (delivered.has(key)) return;
  delivered.add(key);
  trackAnalyticsEvent(event);
  void planningToken().then(() => plannerFetch("/api/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, scope, reason, step, flowScope }), keepalive: true })).then((response) => { if (!response.ok) delivered.delete(key); }).catch(() => delivered.delete(key));
}
export function trackInvitationOpened(token: string) {
  void fetch("/api/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "invitation_opened", token, scope: funnelScope() }), keepalive: true }).catch(() => {});
}
