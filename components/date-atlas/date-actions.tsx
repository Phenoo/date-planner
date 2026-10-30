"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { requestSchema, type PlanRequest } from "@/lib/planner/schema";
import type { ChosenDate } from "@/lib/planner/invitations";
import { dateFeedbackSchema } from "@/lib/planner/date-feedback";
import { dateCalendar } from "@/lib/planner/calendar";
import { zonedNow } from "@/lib/planner/schedule";
import { dateTimingLabel } from "@/lib/planner/date-story";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import styles from "./date-journey.module.css";

export function DateActions({ date, disabled, onChanged }: { date: ChosenDate; disabled: boolean; onChanged: () => void }) {
  const [mode, setMode] = useState<"details" | "rename" | "edit" | "feedback" | null>(null);
  const [title, setTitle] = useState(date.title ?? date.place?.name ?? date.story.title);
  const [preferences, setPreferences] = useState<PlanRequest | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attended, setAttended] = useState("");
  const [relevance, setRelevance] = useState("");
  const [enjoyment, setEnjoyment] = useState("");
  const [costAccuracy, setCostAccuracy] = useState("");
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function call(body: unknown, endpoint = "/api/date-history") {
    if (controller.current || disabled) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setMessage("");
    try {
      const data = await readPlanningResponse(await plannerFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([current.signal, AbortSignal.timeout(30000)]) }), () => {});
      if (current.signal.aborted) return;
      return { data };
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { if (!current.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  async function openEdit() {
    setMode("edit"); setPreferences(null);
    const response = await call({ action: "context", id: date.id });
    if (!response) return;
    const parsed = z.object({ request: requestSchema }).safeParse(response.data);
    if (!parsed.success) { setMessage("Your saved preferences couldn't be opened. Please retry."); return; }
    const request = parsed.data.request;
    setPreferences({ ...request, budget: request.budget === null ? null : request.budget * (request.budgetType === "per-person" ? request.guests : 1), budgetType: "total", ...(date.suggestedTime ? { ...date.suggestedTime, endTime: "" } : {}) });
  }
  async function saveAction(body: unknown, endpoint?: string) {
    const response = await call(body, endpoint);
    if (!response) return;
    setMode(null); setDeleteOpen(false); setPublishOpen(false); onChanged();
  }
  function download() {
    try {
      const blob = new Blob([dateCalendar(date, date.id)], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "our-date.ics"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Calendar download couldn't start."); }
  }
  async function share(copy = false) {
    const url = `${window.location.origin}/invite/${date.token}`;
    try {
      if (!copy && navigator.share) await navigator.share({ title: "A date, just us two.", url });
      else { await navigator.clipboard.writeText(url); if (mounted.current) setMessage("Invitation link copied."); }
    } catch (error) { if (mounted.current && !(error instanceof Error && error.name === "AbortError")) setMessage("Sharing didn't open. Try copying the link instead."); }
  }
  function updatePreferences(changes: Partial<PlanRequest>) { setPreferences((current) => current ? { ...current, ...changes } : current); }
  function close(open: boolean) { if (!open && !busy) { setMode(null); setMessage(""); } }
  return <div>
    {date.suggestedTime && <p role="status">Another time suggested: {date.suggestedTime.date} at {date.suggestedTime.startTime} · {date.suggestedTime.timeZone}. Review it before updating the plan.</p>}
    <div className={styles.actions}>
      <Button variant="outline" disabled={busy || disabled} onClick={() => { setMessage(""); setMode("details"); }}>View date</Button>
      <Button variant="outline" disabled={busy || disabled} onClick={() => { setMessage(""); setMode("rename"); }}>Rename</Button>
      {date.dateStatus !== "completed" && date.canEdit && <Button variant="outline" disabled={busy || disabled} onClick={() => void openEdit()}>Edit plan</Button>}
      {date.date && date.startTime && <Button variant="outline" onClick={download}>Add to calendar</Button>}
      <Button variant="outline" disabled={busy || disabled} onClick={() => { setMessage(""); setMode("feedback"); }}>Leave feedback</Button>
      {date.invitationPublished && !date.invitationRevoked ? <><Button variant="outline" onClick={() => void share()}>Share invitation</Button><Button variant="outline" onClick={() => void share(true)}>Copy link</Button><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`A date, just us two. ${typeof window === "undefined" ? "" : window.location.origin}/invite/${date.token}`)}`}>WhatsApp ↗</a></> : date.dateStatus !== "completed" && date.canEdit && <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy || disabled}>Create invitation</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Share this date?</AlertDialogTitle><AlertDialogDescription>Anyone with the link can see the venue, day, time and date preview, and respond. Your private answers stay private. You can revoke access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void saveAction({ action: "publish", id: date.id }); }}>Create invitation</AlertDialogAction></AlertDialogFooter>{message && <p role="alert">{message}</p>}</AlertDialogContent></AlertDialog>}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy || disabled}>Delete date</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this date?</AlertDialogTitle><AlertDialogDescription>This removes the date and its linked saved plan and feedback. Its invitation link will stop working. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep date</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void saveAction({ action: "delete", id: date.id }); }}>Delete date</AlertDialogAction></AlertDialogFooter>{message && <p role="alert">{message}</p>}</AlertDialogContent></AlertDialog>
    </div>
    <Dialog open={mode !== null} onOpenChange={close} title={mode === "details" ? "Your saved date" : mode === "edit" ? "Edit your date plan" : mode === "feedback" ? "Private date feedback" : "Rename your date"}>
      <div className="form-stack" style={{ padding: 28 }}><h2>{mode === "details" ? date.title ?? "Your saved date" : mode === "edit" ? "Edit your date plan" : mode === "feedback" ? "How was your date?" : "Give this date a name"}</h2>
        {mode === "details" && <><p>{dateTimingLabel(date.datePreference, date.startTime, date.dateStatus === "completed", date.date)} · {date.timeZone} · {date.duration / 60} hours</p><ChosenPlaceCard place={date.place} placeId={date.placeId} catalog={date.source === "catalog"} /><p>Confirm current costs, opening hours and any reservation directly with the venue.</p>{date.place?.details?.website && <a href={date.place.details.website} target="_blank" rel="noreferrer">Visit the venue website ↗</a>}<DateStoryView story={date.story} label="YOUR DATE, SAVED PRIVATELY" /></>}
        {mode === "rename" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void saveAction({ action: "rename", id: date.id, title }); }}><label className="field"><span>Name · visible only to you</span><input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label><Button disabled={busy || !title.trim()}>Save name</Button></form>}
        {mode === "edit" && (preferences ? <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void saveAction({ action: "update", id: date.id, request: preferences }); }}><p>We&apos;ll check this place against your updated details. Existing invitation links will be revoked; create a fresh invitation after saving.</p><label className="field"><span>City</span><input required value={preferences.city} onChange={(event) => updatePreferences({ city: event.target.value })} /></label><label className="field"><span>Area</span><input required value={preferences.area} onChange={(event) => updatePreferences({ area: event.target.value })} /></label><label className="field"><span>Total budget for {preferences.guests} people (₦, optional)</span><input type="number" min={1000} max={10000000} value={preferences.budget ?? ""} onChange={(event) => updatePreferences({ budget: event.target.value === "" ? null : Number(event.target.value) })} /></label><label className="field"><span>Day</span><input required type="date" min={zonedNow(preferences.timeZone).date} value={preferences.date} onChange={(event) => updatePreferences({ date: event.target.value })} /></label><label className="field"><span>Starting time · {preferences.timeZone}</span><input required type="time" value={preferences.startTime} onChange={(event) => updatePreferences({ startTime: event.target.value, endTime: "" })} /></label><label className="field"><span>Duration in hours</span><input required type="number" min={1} max={12} step={0.5} value={preferences.duration / 60} onChange={(event) => updatePreferences({ duration: Math.round(Number(event.target.value) * 60) })} /></label><Button disabled={busy}>{busy ? "Checking this date…" : "Check and save changes"}</Button></form> : <p role="status">{busy ? "Opening your saved preferences…" : "Your original date is unchanged."}</p>)}
        {mode === "feedback" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); const parsed = dateFeedbackSchema.safeParse({ dateId: date.id, attended: attended === "yes", relevance: Number(relevance), ...(attended === "yes" ? { enjoyment: Number(enjoyment), costAccuracy } : {}) }); if (!attended || !parsed.success) { setMessage("Please complete the feedback fields."); return; } void saveAction(parsed.data, "/api/date-feedback"); }}><p>Your feedback stays private. It is not published as a review or testimonial.</p><label className="field"><span>Did this date happen?</span><select required value={attended} onChange={(event) => setAttended(event.target.value)}><option value="" disabled>Choose an answer</option><option value="yes">Yes, we went</option><option value="no">No, it hasn&apos;t happened</option></select></label><label className="field"><span>How well did the recommendation fit? (1–5)</span><input required type="number" min={1} max={5} value={relevance} onChange={(event) => setRelevance(event.target.value)} /></label>{attended === "yes" && <><label className="field"><span>How much did you enjoy it? (1–5)</span><input required type="number" min={1} max={5} value={enjoyment} onChange={(event) => setEnjoyment(event.target.value)} /></label><label className="field"><span>How did the costs compare?</span><select required value={costAccuracy} onChange={(event) => setCostAccuracy(event.target.value)}><option value="" disabled>Choose an answer</option><option value="accurate">Close to the estimate</option><option value="higher">Higher than expected</option><option value="lower">Lower than expected</option><option value="unknown">No estimate to compare</option></select></label></>}<Button disabled={busy}>Save private feedback</Button></form>}
        {message && <p role="alert" className="error-message">{message}</p>}
      </div>
    </Dialog>
    {message && mode === null && !deleteOpen && !publishOpen && <p role="status">{message}</p>}
  </div>;
}
