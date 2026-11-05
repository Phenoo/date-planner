"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { getBrowserAuth, sendEmailSignIn, authErrorMessage } from "@/lib/firebase/client";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { createdInvitationSchema, pendingInvitationKey } from "@/lib/planner/invitations";
import { invitationReturnKey } from "@/lib/planner/discovery-session";
import { pendingDateReminderKey, readDateReminderIntent, reminderRecipientKey } from "@/lib/planner/date-reminder-intent";
import { z } from "zod";
import styles from "./date-journey.module.css";

const scheduledSchema = z.object({ scheduled: z.literal(true), sendAt: z.iso.datetime() });
const failureMessage = (failure: unknown) => failure instanceof z.ZodError ? "Your reminder couldn’t be confirmed. Try again." : failure instanceof Error && "code" in failure ? authErrorMessage(failure) : failure instanceof Error ? failure.message : "Your reminder couldn’t be set. Try again.";

export function DateReminderDialog({ open, onOpenChange, sessionId, placeId, signedIn, onSaved, onScheduled }: {
  open: boolean; onOpenChange: (open: boolean) => void; sessionId?: string; placeId: string; signedIn: boolean;
  onSaved: (saved: boolean) => void; onScheduled: (sendAt: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const mounted = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort(); }; }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.resolve().then(() => { const address = getBrowserAuth()?.currentUser?.email; if (active && address) setEmail(previous => previous || address); });
    return () => { active = false; };
  }, [open]);

  const schedule = useCallback(async (controller: AbortController, ownerId: string) => {
    const stillCurrent = () => !controller.signal.aborted && mounted.current && getBrowserAuth()?.currentUser?.uid === ownerId;
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, placeId }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) };
    const saved = await plannerFetch("/api/invitations", { ...init, body: JSON.stringify({ action: "save", sessionId, placeId }) });
    createdInvitationSchema.parse(await readPlanningResponse(saved, () => {}));
    if (!stillCurrent()) return;
    onSaved(true);
    const response = await plannerFetch("/api/date-reminders", init);
    const result = scheduledSchema.parse(await readPlanningResponse(response, () => {}));
    if (!stillCurrent()) return;
    try { localStorage.removeItem(pendingDateReminderKey); } catch { /* Server scheduling is idempotent. */ }
    onScheduled(result.sendAt);
    setScheduled(true);
    setMessage("Your reminder is set. We’ll email you before your date.");
  }, [sessionId, placeId, onSaved, onScheduled]);

  useEffect(() => {
    if (!signedIn || !sessionId) return;
    const controller = new AbortController();
    operation.current = controller;
    void (async () => {
      let intent;
      try { intent = readDateReminderIntent(localStorage.getItem(pendingDateReminderKey), sessionId, placeId); } catch { return; }
      if (!intent) return;
      await planningToken();
      const owner = getBrowserAuth()?.currentUser;
      if (controller.signal.aborted || !owner?.email || !owner.emailVerified || owner.isAnonymous || await reminderRecipientKey(owner.email) !== intent.recipientKey) return;
      if (controller.signal.aborted) return;
      submitting.current = true; setBusy(true); setError(""); onOpenChange(true);
      await schedule(controller, owner.uid);
    })().catch(failure => { if (!controller.signal.aborted && mounted.current) { onOpenChange(true); setError(failureMessage(failure)); } }).finally(() => { if (operation.current === controller) submitting.current = false; if (!controller.signal.aborted && mounted.current) setBusy(false); });
    return () => controller.abort();
  }, [signedIn, sessionId, placeId, schedule, onOpenChange]);

  async function submit() {
    if (submitting.current) return;
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller;
    submitting.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      if (!sessionId) throw new Error("Reopen your chosen date before setting a reminder.");
      await planningToken();
      if (controller.signal.aborted) return;
      const owner = getBrowserAuth()?.currentUser;
      const address = email.trim() || owner?.email || "";
      if (!z.email().safeParse(address).success) throw new Error("Enter a valid email address.");
      if (owner && !owner.isAnonymous && owner.emailVerified && owner.email?.toLowerCase() === address.toLowerCase()) {
        await schedule(controller, owner.uid);
        return;
      }
      const recipientKey = await reminderRecipientKey(address);
      if (controller.signal.aborted) return;
      const expiresAt = Date.now() + 3600000;
      localStorage.setItem(pendingDateReminderKey, JSON.stringify({ sessionId, placeId, recipientKey, expiresAt }));
      localStorage.setItem(pendingInvitationKey, JSON.stringify({ sessionId, placeId, action: "save", expiresAt }));
      localStorage.setItem(invitationReturnKey, JSON.stringify({ flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", sessionId, placeId, accepted: true, expiresAt }));
      await sendEmailSignIn(address);
      if (!controller.signal.aborted && mounted.current) setMessage("Check your email. Open the secure link in this browser to save your date and confirm the reminder.");
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current) setError(failureMessage(failure));
    } finally { if (operation.current === controller) submitting.current = false; if (!controller.signal.aborted && mounted.current) setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title="Keep your date in mind" description="Save your date and confirm an email reminder." className={styles.reminderDialog}>
    <h2>One less thing to remember.</h2>
    <p>We’ll email you one day before your date. If it’s sooner, we’ll send the reminder shortly.</p>
    {!scheduled && <form className="form-stack" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <label className="field"><span>Your email</span><input type="email" required={!signedIn} autoComplete="email" autoFocus placeholder="you@example.com" value={email} disabled={busy} onChange={event => { setEmail(event.target.value); setError(""); }} /></label>
      <Button type="submit" disabled={busy}>{busy ? "Keeping your date…" : "Set my reminder"}</Button>
    </form>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {scheduled && <Button onClick={() => onOpenChange(false)}>Done</Button>}
    <p className={styles.reminderNote}>A secure email link confirms your address and saves this date to your account. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></p>
  </Dialog>;
}
