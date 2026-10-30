"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
const queueSchema = z.object({ requests: z.array(z.object({ id: z.string(), status: z.enum(["requested", "processing"]), requestedAt: z.string(), retryAt: z.number().nullable() })) });
export function PrivacyOperations() {
  const [queue, setQueue] = useState<z.infer<typeof queueSchema>["requests"]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function run(id?: string) {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setMessage("");
    try {
      if (id) {
        const data = z.object({ complete: z.boolean(), retryAt: z.number().optional(), message: z.string().optional() }).parse(await readPlanningResponse(await plannerFetch("/api/admin/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal: AbortSignal.any([current.signal, AbortSignal.timeout(30000)]) }), () => {}));
        if (!current.signal.aborted) setMessage(data.complete ? "Account and owned records removed. A minimal hashed completion receipt expires after 30 days." : data.message ?? "One batch removed. Continue processing until the request is complete.");
      }
      const data = queueSchema.parse(await readPlanningResponse(await plannerFetch("/api/admin/privacy", { signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]), cache: "no-store" }), () => {}));
      if (!current.signal.aborted) { setQueue(data.requests); setCheckedAt(Date.now()); setOpen(null); }
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : "Privacy queue couldn't be loaded."); }
    finally { if (!current.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return <section className="data-notice"><h2>Account deletion requests</h2><p>Verify each request before starting. Processing disables the account, waits ten minutes for in-flight operations, then removes records in resumable batches. Another administrator must process your own account request. Do not mark a request complete before all batches finish.</p><Button variant="outline" disabled={busy} onClick={() => void run()}>Load privacy requests</Button>{queue.map((request) => <div key={request.id}><p>Request {request.id.slice(0, 10)} · {request.status} · {request.requestedAt.slice(0, 10)}</p>{request.retryAt && request.retryAt > checkedAt && <p>Removal can continue after {new Date(request.retryAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} (Africa/Lagos).</p>}<AlertDialog open={open === request.id} onOpenChange={(value) => setOpen(value ? request.id : null)}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>{request.status === "requested" ? "Review and start deletion" : "Continue deletion"}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{request.status === "requested" ? "Start account deletion?" : "Continue removing account data?"}</AlertDialogTitle><AlertDialogDescription>This permanently removes the requested account and its private data and public invitation links. Confirm that you have verified the request. Processing can be resumed if interrupted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void run(request.id); }}>Process request</AlertDialogAction></AlertDialogFooter>{message && <p role="alert">{message}</p>}</AlertDialogContent></AlertDialog></div>)}{message && !open && <p role="status">{message}</p>}</section>;
}
