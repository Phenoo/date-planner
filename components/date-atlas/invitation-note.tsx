"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { invitationMessageSchema } from "@/lib/planner/invitations";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import styles from "./invitation-note.module.css";

export function InvitationNote({ selection, onSaved, onDirtyChange }: {
  selection: { id: string; token: string; message?: string };
  onSaved: (message: string) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [message, setMessage] = useState(selection.message ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const dirty = message.trim() !== (selection.message ?? "");
  useEffect(() => () => { controller.current?.abort(); onDirtyChange(false); }, [onDirtyChange]);
  async function save() {
    if (controller.current || !dirty) return;
    const action = new AbortController(); controller.current = action;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", id: selection.id, message }), signal: AbortSignal.any([action.signal, AbortSignal.timeout(15000)]) });
      const result = z.object({ message: invitationMessageSchema }).parse(await readPlanningResponse(response, () => {}));
      if (!action.signal.aborted) { setMessage(result.message); onSaved(result.message); onDirtyChange(false); setNotice("Message saved to your invitation."); }
    } catch (failure) { if (!action.signal.aborted) setError(failure instanceof Error ? failure.message : "Your message couldn't be saved. Please try again."); }
    finally { controller.current = null; if (!action.signal.aborted) setSaving(false); }
  }
  return <div className={styles.note}>
    <details><summary>{selection.message ? "Edit your personal note" : "Add a personal note"} <span>(optional)</span></summary>
      <Field label="A message for your date" hint="This message will be visible to anyone with your invitation link."><textarea value={message} maxLength={240} rows={3} disabled={saving} placeholder="I thought we'd love a little time together…" onChange={(event) => { const value = event.target.value; setMessage(value); setNotice(""); onDirtyChange(value.trim() !== (selection.message ?? "")); }} /></Field>
      <div className={styles.actions}><Button disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save message"}</Button>{dirty && <Button variant="outline" disabled={saving} onClick={() => { setMessage(selection.message ?? ""); onDirtyChange(false); setError(""); }}>Discard changes</Button>}</div>
      {dirty && <p>Save or discard your message before sharing.</p>}
      {error && <p role="alert" className="error-message">{error}</p>}{notice && <p role="status">{notice}</p>}
    </details>
    <a href={`/invite/${selection.token}`} target="_blank" rel="noopener noreferrer" aria-disabled={dirty} onClick={(event) => { if (dirty) event.preventDefault(); }}>Preview invitation ↗</a>
  </div>;
}
