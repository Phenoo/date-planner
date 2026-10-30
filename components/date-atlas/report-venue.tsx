"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { plannerFetch, planningToken, readPlanningResponse } from "@/lib/firebase/planner-client";
import { reportReasonSchema } from "@/lib/planner/venue-control";

export function ReportVenue({ placeId, sessionId }: { placeId: string; sessionId?: string }) {
  const [reason, setReason] = useState("hours");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function report() {
    if (controller.current && !controller.current.signal.aborted) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setStatus("");
    try {
      await planningToken();
      await readPlanningResponse(await plannerFetch("/api/venue-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId, sessionId, reason: reportReasonSchema.parse(reason) }), signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]) }), () => {});
      if (!current.signal.aborted) setStatus("Thank you. We've flagged these details for review.");
    } catch (error) { if (!current.signal.aborted) setStatus(error instanceof Error ? error.message : "Please try again."); }
    finally { if (!current.signal.aborted) { setBusy(false); controller.current = null; } }
  }
  return <details className="data-notice"><summary>Report incorrect venue details</summary><label className="field"><span>What needs checking?</span><select value={reason} onChange={(event) => setReason(event.target.value)}><option value="hours">Opening hours</option><option value="price">Price</option><option value="access">Accessibility or dietary information</option><option value="closed">Venue is closed</option><option value="other">Other venue information</option></select></label><Button variant="outline" disabled={busy} onClick={() => void report()}>{busy ? "Sending…" : "Send report"}</Button>{status && <p role="status">{status}</p>}</details>;
}
