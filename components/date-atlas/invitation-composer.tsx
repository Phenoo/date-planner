"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { createdInvitationSchema, inviterNameSchema } from "@/lib/planner/invitations";

type Selection = z.infer<typeof createdInvitationSchema>;

export function InvitationComposer({ initialName = "", onClose, onCreate }: {
  initialName?: string;
  onClose: () => void;
  onCreate: (name: string, signal: AbortSignal) => Promise<Selection>;
}) {
  const [name, setName] = useState(initialName);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sharing = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current) return;
    const result = inviterNameSchema.safeParse(name);
    if (!result.success) { setError("Enter the name you want your date to see."); return; }
    const action = new AbortController();
    controller.current = action;
    setBusy(true);
    setError("");
    try {
      const next = await onCreate(result.data, action.signal);
      if (!action.signal.aborted) setSelection(next);
    } catch (failure) {
      if (!action.signal.aborted) setError(failure instanceof Error ? failure.message : "Your invitation couldn’t be prepared. Try again.");
    } finally {
      if (controller.current === action) controller.current = null;
      if (!action.signal.aborted) setBusy(false);
    }
  }

  async function share() {
    if (!selection || sharing.current) return;
    sharing.current = true;
    setMessage("");
    setError("");
    const url = new URL(`/invite/${selection.token}`, window.location.origin).href;
    try {
      if (navigator.share) {
        try { await navigator.share({ title: "A date, just us two.", url }); return; }
        catch (failure) { if (failure instanceof Error && failure.name === "AbortError") return; }
      }
      await navigator.clipboard.writeText(url);
      setMessage("Invitation copied. Paste it into a message to your date.");
    } catch {
      setError("Sharing didn’t open. Try again.");
    } finally { sharing.current = false; }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Invite your date">
    <div className="form-stack">
      <h2>{selection ? "Your invitation is ready" : "Invite your date"}</h2>
      {selection ? <>
        <p>They can accept or suggest a change right from the invitation.</p>
        <Button onClick={() => void share()}>Share invitation</Button>
      </> : <form className="form-stack" onSubmit={(event) => void prepare(event)}>
        <Field label="Your name" hint="Your date will see this name on the invitation."><input value={name} autoComplete="name" required maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)} /></Field>
        <Button type="submit" disabled={busy}>{busy ? "Preparing…" : "Prepare invitation"}</Button>
      </form>}
      {message && <p role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  </Dialog>;
}
