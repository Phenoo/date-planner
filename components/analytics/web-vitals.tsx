"use client";
import { useReportWebVitals } from "next/web-vitals";
import { analyticsPage } from "@/lib/analytics/policy";
import { webVitalSchema } from "@/lib/analytics/metrics";

const page = typeof window === "undefined" ? null : analyticsPage(window.location.pathname);
const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (!["LCP", "INP", "CLS"].includes(metric.name)) return;
  if (!page) return;
  const sample = webVitalSchema.safeParse({ name: metric.name, value: metric.value, id: metric.id, path: page.path, device: window.matchMedia("(max-width: 700px)").matches ? "mobile" : "desktop" });
  if (!sample.success) return;
  const body = JSON.stringify(sample.data);
  if (navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/vitals", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
};
export function WebVitals() { useReportWebVitals(report); return null; }
