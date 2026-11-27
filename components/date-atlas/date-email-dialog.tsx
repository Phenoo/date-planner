"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { authErrorMessage, completeEmailSignIn, hasEmailSignInLink, sendEmailSignIn } from "@/lib/firebase/client";

export type DateEmailAction = "save" | "invite" | "verify";

export function DateEmailDialog({ action, prepare, onClose, onVerified, verifying, verificationError }: {
  action: DateEmailAction;
  prepare: () => void;
  onClose: (linkSent: boolean) => void;
  onVerified: () => void;
  verifying: boolean;
  verificationError: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const linkSent = useRef(false);
  const finishing = action === "verify" && hasEmailSignInLink();
  const title = finishing ? "Confirm your email" : sent ? "Check your email" : action === "save" ? "Save your date" : action === "invite" ? "Invite your date" : "Get a new sign-in link";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address || pending.current || verifying) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (finishing) {
        if (await completeEmailSignIn(address)) onVerified();
      } else {
        prepare();
        await sendEmailSignIn(address);
        linkSent.current = true;
        setSent(address);
      }
    } catch (failure) {
      setError(finishing ? authErrorMessage(failure) : failure instanceof Error ? failure.message : "We couldn’t send your link. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !pending.current && !verifying) onClose(linkSent.current || action === "verify"); }} title={title}>
    <div className="form-stack">
      <h2>{title}</h2>
      {sent ? <>
        <p>We sent a secure link to <strong>{sent}</strong>. Open it in this browser to {action === "save" ? "save this date in My dates" : action === "invite" ? "return to your date and finish your invitation" : "return to your date"}.</p>
        <Button variant="outline" onClick={() => setSent("")}>Use a different email</Button>
      </> : verifying ? <p role="status">Opening your date…</p> : <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <p>{finishing ? "Enter the email address that received this link." : "Enter your email and we’ll send you a secure link to continue."}</p>
        <Field label="Your email"><input type="email" autoComplete="email" value={email} required maxLength={254} disabled={busy} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Button type="submit" disabled={busy}>{busy ? (finishing ? "Checking…" : "Sending…") : finishing ? "Continue" : "Email me a link"}</Button>
      </form>}
      {(error || verificationError) && <p className="error-message" role="alert">{error || verificationError}</p>}
    </div>
  </Dialog>;
}
