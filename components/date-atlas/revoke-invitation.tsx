"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import styles from "./date-journey.module.css";

export function RevokeInvitation({ id, onRevoked }: { id: string; onRevoked: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function revoke() {
    if (controller.current) return;
    const action = new AbortController(); controller.current = action;
    setBusy(true); setError("");
    try {
      const response = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", id }), signal: action.signal });
      z.object({ revoked: z.literal(true) }).parse(await readPlanningResponse(response, () => {}));
      if (!action.signal.aborted) { setOpen(false); onRevoked(); }
    } catch (failure) {
      if (!action.signal.aborted) setError(failure instanceof Error ? failure.message : "This link couldn't be revoked. Please try again.");
    } finally { controller.current = null; if (!action.signal.aborted) setBusy(false); }
  }
  return <AlertDialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setError(""); } }}>
    <AlertDialogTrigger asChild><button type="button" className={styles.textButton}>Revoke invitation link</button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Revoke this invitation?</AlertDialogTitle><AlertDialogDescription>The link will stop showing this date or accepting replies. Your private saved date will stay in your account.</AlertDialogDescription></AlertDialogHeader>
      {error && <p className="error-message" role="alert">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep link</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void revoke(); }}>{busy ? "Revoking…" : "Revoke link"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
