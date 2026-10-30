"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
export function AccountPrivacy() {
  const [status, setStatus] = useState("none"); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(action?: "request" | "cancel") {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setMessage("");
    try {
      const response = await plannerFetch("/api/account/privacy", { ...(action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) } : {}), signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]) });
      const data = z.object({ status: z.enum(["none", "requested", "processing", "complete"]) }).parse(await readPlanningResponse(response, () => {}));
      if (!current.signal.aborted) { setStatus(data.status); setOpen(false); setMessage(action === "request" ? "Your deletion request is recorded for review. It has not been completed yet." : action === "cancel" ? "Deletion request withdrawn." : ""); }
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { if (!current.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return <details onToggle={(event) => { if (event.currentTarget.open) void load(); }}><summary>Privacy &amp; account deletion</summary><p>Request removal of your account, private dates, saved plans, feedback and invitation links. Requests are reviewed before deletion starts. You can withdraw while the request is pending.</p><p>Request status: {status === "none" ? "No active request" : status}</p>{status === "requested" ? <Button variant="outline" disabled={busy} onClick={() => void load("cancel")}>Withdraw request</Button> : status === "none" && <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>Request account deletion</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Request account deletion?</AlertDialogTitle><AlertDialogDescription>Once processing begins, your account will be disabled and your saved dates and invitations will be removed. You can withdraw the request before processing starts.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void load("request"); }}>Submit deletion request</AlertDialogAction></AlertDialogFooter>{message && <p role="alert">{message}</p>}</AlertDialogContent></AlertDialog>}{message && !open && <p role="status">{message}</p>}</details>;
}
