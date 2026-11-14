"use client";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { currencyDigits } from "@/lib/planner/currency";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { requestSchema, type PlanRequest } from "@/lib/planner/schema";
import { backupPlaceSchema, createdInvitationSchema, type ChosenDate } from "@/lib/planner/invitations";
import { dateFeedbackSchema } from "@/lib/planner/date-feedback";
import { dateCalendar } from "@/lib/planner/calendar";
import { zonedNow } from "@/lib/planner/schedule";
import { dateTimingLabel } from "@/lib/planner/date-story";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import { InvitationNote } from "./invitation-note";
import { RevokeInvitation } from "./revoke-invitation";
import styles from "./date-history.module.css";

type BackupPlace = z.infer<typeof backupPlaceSchema>;
const savedBackupSchema = z.object({ placeId: backupPlaceSchema.shape.id.nullable(), place: backupPlaceSchema.nullable(), closedAtPlannedTime: z.boolean().optional() });

export function DateActions({ date, disabled, completing, onComplete, onRevoked, onChanged, onReplan, onBackupChanged }: { date: ChosenDate; disabled: boolean; completing: boolean; onComplete: () => void; onRevoked: () => void; onChanged: () => void; onReplan: (request: PlanRequest) => void; onBackupChanged: (placeId: string | undefined) => void }) {
  const [mode, setMode] = useState<"details" | "rename" | "edit" | "feedback" | "review" | "backup" | null>(null);
  const [title, setTitle] = useState(date.title ?? date.place?.name ?? date.story.title);
  const [preferences, setPreferences] = useState<PlanRequest | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [reviewTime, setReviewTime] = useState<ChosenDate["suggestedTime"]>(undefined);
  const [updatedInviteToken, setUpdatedInviteToken] = useState("");
  const [savedBackup, setSavedBackup] = useState<z.infer<typeof savedBackupSchema> | null>(null);
  const [backupSuggestion, setBackupSuggestion] = useState<BackupPlace | null>(null);
  const [invitationDirty, setInvitationDirty] = useState(false);
  const [attended, setAttended] = useState("");
  const [relevance, setRelevance] = useState("");
  const [enjoyment, setEnjoyment] = useState("");
  const [costAccuracy, setCostAccuracy] = useState("");
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (updatedInviteToken) reviewHeading.current?.focus(); }, [updatedInviteToken]);
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
  async function loadPreferences() {
    const response = await call({ action: "context", id: date.id });
    if (!response) return;
    const parsed = z.object({ request: requestSchema }).safeParse(response.data);
    if (!parsed.success) { setMessage("Your saved preferences couldn't be opened. Please retry."); return; }
    return parsed.data.request;
  }
  async function openEdit() {
    setMode("edit"); setPreferences(null);
    const request = await loadPreferences();
    if (!request) return;
    setPreferences({ ...request, durationMode: "estimated", endTime: "", budget: request.budget === null ? null : request.budget * (request.budgetType === "per-person" ? request.guests : 1), budgetType: "total", ...(date.suggestedTime ? { ...date.suggestedTime, endTime: "" } : {}) });
  }
  async function replanWithVibe() {
    if (!date.suggestedVibe) return;
    const request = await loadPreferences();
    if (request) onReplan({ ...request, vibes: [date.suggestedVibe] });
  }
  function openReview() {
    setMessage("");
    setShareNotice("");
    setReviewTime(date.suggestedTime);
    setMode("review");
  }
  async function reviseInvitation() {
    if (!reviewTime) return;
    const response = await call({ action: "revise-invitation", id: date.id, token: date.token, date: reviewTime.date, startTime: reviewTime.startTime });
    if (!response) return;
    const parsed = createdInvitationSchema.safeParse(response.data);
    if (parsed.success) setUpdatedInviteToken(parsed.data.token);
    else setMessage("The updated invite couldn't be opened. Try again.");
  }
  async function openBackup() {
    setMode("backup");
    setSavedBackup(null);
    setBackupSuggestion(null);
    const response = await call({ action: "read-backup", id: date.id });
    if (!response) return;
    const parsed = savedBackupSchema.safeParse(response.data);
    if (!parsed.success) { setMessage("The backup couldn't be opened. Try again."); return; }
    setSavedBackup(parsed.data);
    if (parsed.data.placeId !== (date.backupPlaceId ?? null)) onBackupChanged(parsed.data.placeId ?? undefined);
  }
  async function suggestBackup() {
    setBackupSuggestion(null);
    const response = await call({ action: "suggest-backup", id: date.id });
    if (!response) return;
    const parsed = z.object({ place: backupPlaceSchema.nullable() }).safeParse(response.data);
    if (!parsed.success) { setMessage("The backup suggestion couldn't be opened. Try again."); return; }
    if (!parsed.data.place) { setMessage("We couldn't find another nearby venue that fits this date."); return; }
    setBackupSuggestion(parsed.data.place);
  }
  async function saveBackup(place: BackupPlace) {
    if (!savedBackup) return;
    const response = await call({ action: "save-backup", id: date.id, placeId: place.id, previousPlaceId: savedBackup.placeId });
    if (!response) return;
    setSavedBackup({ placeId: place.id, place });
    setBackupSuggestion(null);
    onBackupChanged(place.id);
  }
  async function removeBackup(placeId: string) {
    const response = await call({ action: "remove-backup", id: date.id, previousPlaceId: placeId });
    if (!response) return;
    setSavedBackup({ placeId: null, place: null });
    setBackupSuggestion(null);
    onBackupChanged(undefined);
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
  async function share(copy = false, token = date.token) {
    if (invitationDirty) return;
    const url = `${window.location.origin}/invite/${token}`;
    setMessage("");
    setShareNotice("");
    try {
      if (!copy && navigator.share) await navigator.share({ title: "A date, just us two.", url });
      else { await navigator.clipboard.writeText(url); if (mounted.current) setShareNotice("Invitation link copied."); }
    } catch (error) { if (mounted.current && !(error instanceof Error && error.name === "AbortError")) setMessage("Sharing didn't open. You can copy the invitation link."); }
  }
  function updatePreferences(changes: Partial<PlanRequest>) { setPreferences((current) => current ? { ...current, ...changes, ...(changes.city && changes.city !== current.city || changes.country && changes.country !== current.country ? { timeZoneConfirmed: false } : {}) } : current); }
  function close(open: boolean) {
    if (open || busy) return;
    setMode(null);
    setMessage("");
    setShareNotice("");
    if (updatedInviteToken) {
      setUpdatedInviteToken("");
      onChanged();
    }
  }
  const suggestion = date.dateStatus === "planned" && (date.suggestedVibe
    ? `They suggested a different vibe: ${date.suggestedVibe}.`
    : date.suggestedTime && `They suggested ${dateTimingLabel(date.datePreference, date.suggestedTime.startTime, false, date.suggestedTime.date)} (${date.suggestedTime.timeZone}).`);
  const updatedUrl = updatedInviteToken ? `${window.location.origin}/invite/${updatedInviteToken}` : "";
  const canFindBackup = date.dateStatus === "planned" && date.canEdit && Boolean(date.date && date.startTime);
  return <div className={styles.cardActions}>
    <Button className={styles.open} disabled={busy || disabled} onClick={() => { setMessage(""); setMode("details"); }}>Open date</Button>
    {date.backupPlaceId && <Button className={styles.backupButton} variant="outline" disabled={busy || disabled} onClick={() => void openBackup()}>View date-night backup</Button>}
    {suggestion && <div className={styles.optionsNotice}>
      <p>{suggestion}</p>
      {date.canEdit && <Button variant="outline" disabled={busy || disabled} onClick={openReview}>Review and send updated invite</Button>}
    </div>}
    <details className={styles.options}>
      <summary aria-label={`More options for ${date.title ?? date.place?.name ?? date.story.title}`}>More options<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className={styles.optionList}>
      {canFindBackup && !date.backupPlaceId && <Button variant="outline" disabled={busy || disabled} onClick={() => void openBackup()}>Add a date-night backup</Button>}
      <Button variant="outline" disabled={busy || disabled} onClick={() => { setMessage(""); setMode("rename"); }}>Rename</Button>
      {date.dateStatus !== "completed" && date.canEdit && <Button variant="outline" disabled={busy || disabled} onClick={() => void openEdit()}>Edit or reschedule</Button>}
      {date.dateStatus !== "completed" && <Button variant="outline" disabled={busy || disabled} onClick={onComplete}>{completing ? "Saving…" : "Mark as done"}</Button>}
      {date.date && date.startTime && <Button variant="outline" onClick={download}>Add to calendar</Button>}
      <Button variant="outline" disabled={busy || disabled} onClick={() => { setMessage(""); setMode("feedback"); }}>Leave feedback</Button>
      {date.invitationPublished && !date.invitationRevoked ? <><Link href={`/invite/${date.token}`}>View invitation</Link><RevokeInvitation id={date.id} onRevoked={onRevoked} /><Button variant="outline" disabled={invitationDirty} onClick={() => void share()}>Share invitation</Button><Button variant="outline" disabled={invitationDirty} onClick={() => void share(true)}>Copy link</Button><a target="_blank" rel="noreferrer" aria-disabled={invitationDirty} onClick={(event) => { if (invitationDirty) event.preventDefault(); }} href={`https://wa.me/?text=${encodeURIComponent(`A date, just us two. ${typeof window === "undefined" ? "" : window.location.origin}/invite/${date.token}`)}`}>WhatsApp ↗</a></> : date.dateStatus !== "completed" && date.canEdit && <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy || disabled}>Create invitation</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Share this date?</AlertDialogTitle><AlertDialogDescription>Anyone with the link can see the venue, day, time and date preview, and respond. Your private answers stay private. You can revoke access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void saveAction({ action: "publish", id: date.id }); }}>Create invitation</AlertDialogAction></AlertDialogFooter>{message && <p role="alert">{message}</p>}</AlertDialogContent></AlertDialog>}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy || disabled}>Delete date</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this date?</AlertDialogTitle><AlertDialogDescription>This removes the date and its linked saved plan and feedback. Its invitation link will stop working. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep date</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void saveAction({ action: "delete", id: date.id }); }}>Delete date</AlertDialogAction></AlertDialogFooter>{message && <p role="alert">{message}</p>}</AlertDialogContent></AlertDialog>
    </div>
    </details>
    <Dialog open={mode !== null} onOpenChange={close} title={mode === "backup" ? "Date-night backup" : mode === "review" ? "Review and send updated invite" : mode === "details" ? "Your saved date" : mode === "edit" ? "Edit your date plan" : mode === "feedback" ? "Private date feedback" : "Rename your date"}>
      <div className="form-stack" style={{ padding: 28 }}>
        <h2 ref={reviewHeading} tabIndex={updatedInviteToken ? -1 : undefined}>{mode === "backup" ? "Date-night backup" : mode === "review" ? updatedInviteToken ? "Your updated invite is ready" : "Review their suggestion" : mode === "details" ? date.title ?? "Your saved date" : mode === "edit" ? "Edit your date plan" : mode === "feedback" ? "How was your date?" : "Give this date a name"}</h2>
        {mode === "backup" && <>
          {!savedBackup && (busy ? <p role="status">Opening your backup…</p> : <Button variant="outline" onClick={() => void openBackup()}>Try again</Button>)}
          {savedBackup && <>
            {savedBackup.place ? <BackupVenue place={savedBackup.place} label="Saved backup" /> : <p>{savedBackup.placeId ? "The saved venue’s details are unavailable. Try again later or look for another backup." : "Keep one nearby venue handy in case your first choice is full or closed."}</p>}
            {savedBackup.closedAtPlannedTime && <p role="status">Listed hours suggest the backup may be closed around your planned start time.</p>}
            {backupSuggestion && <>
              <BackupVenue place={backupSuggestion} label="Suggested backup" />
              <Button disabled={busy || disabled} onClick={() => void saveBackup(backupSuggestion)}>{busy ? "Checking the venue…" : savedBackup.placeId ? "Replace saved backup" : "Save backup venue"}</Button>
            </>}
            {canFindBackup && !backupSuggestion && <Button variant="outline" disabled={busy || disabled} onClick={() => void suggestBackup()}>{busy ? "Looking for a venue…" : savedBackup.placeId ? "Find a different backup" : "Find a backup venue"}</Button>}
            {savedBackup.placeId && <Button variant="ghost" disabled={busy || disabled} onClick={() => { if (savedBackup.placeId) void removeBackup(savedBackup.placeId); }}>Remove backup</Button>}
          </>}
        </>}
        {mode === "review" && (updatedInviteToken ? <>
          <p>Share the new link so they can reply to the updated plan.</p>
          <label className="field"><span>Updated invitation link</span><input readOnly value={updatedUrl} onFocus={(event) => event.currentTarget.select()} /></label>
          <Button onClick={() => void share(false, updatedInviteToken)}>Share updated invite</Button>
          <Button variant="outline" onClick={() => void share(true, updatedInviteToken)}>Copy updated link</Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Here’s the updated plan for our date. ${updatedUrl}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp ↗</a>
          {shareNotice && <p role="status">{shareNotice}</p>}
        </> : <>
          <p>{suggestion}</p>
          {date.suggestedVibe ? <>
            <p>Find a new recommendation with their suggested vibe, then share its invitation from the planner.</p>
            <Button disabled={busy || disabled} onClick={() => void replanWithVibe()}>{busy ? "Opening the planner…" : "Plan with this vibe"}</Button>
          </> : reviewTime && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void reviseInvitation(); }}>
            <p>Current plan · {dateTimingLabel(date.datePreference, date.startTime, false, date.date)}</p>
            <label className="field"><span>Day</span><input required type="date" min={zonedNow(reviewTime.timeZone).date} value={reviewTime.date} disabled={busy} onChange={(event) => setReviewTime({ ...reviewTime, date: event.target.value })} /></label>
            <label className="field"><span>Start time ({reviewTime.timeZone})</span><input required type="time" value={reviewTime.startTime} disabled={busy} onChange={(event) => setReviewTime({ ...reviewTime, startTime: event.target.value })} /></label>
            <p>We’ll check that the venue fits this time. Creating the updated invite replaces the previous link.</p>
            <Button disabled={busy || disabled}>{busy ? "Checking the venue…" : "Create updated invite"}</Button>
          </form>}
        </>)}
        {mode === "details" && <><p>{dateTimingLabel(date.datePreference, date.startTime, date.dateStatus === "completed", date.date)}</p><ChosenPlaceCard place={date.place} placeId={date.placeId} catalog={date.source === "catalog"} /><p>Confirm current costs, opening hours and any reservation directly with the venue.</p>{date.place?.details?.website && <a href={date.place.details.website} target="_blank" rel="noreferrer">Visit the venue website ↗</a>}{date.invitationPublished && !date.invitationRevoked && <InvitationNote key={date.token} selection={date} onDirtyChange={setInvitationDirty} onSaved={onChanged} />}<DateStoryView story={date.story} category={date.place?.category} label="YOUR DATE, SAVED PRIVATELY" /></>}
        {mode === "rename" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void saveAction({ action: "rename", id: date.id, title }); }}><label className="field"><span>Name · visible only to you</span><input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label><Button disabled={busy || !title.trim()}>Save name</Button></form>}
        {mode === "edit" && (preferences ? <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void saveAction({ action: "update", id: date.id, request: preferences }); }}><p>We&apos;ll check this place against your updated details. Existing invitation links will be revoked; create a fresh invitation after saving.</p><label className="field"><span>City</span><input required value={preferences.city} onChange={(event) => updatePreferences({ city: event.target.value })} /></label><label className="field"><span>Area</span><input required value={preferences.area} onChange={(event) => updatePreferences({ area: event.target.value })} /></label><label className="field"><span>Total budget for {preferences.guests} people ({preferences.currency}, optional)</span><input type="number" min={0} step={10 ** -currencyDigits(preferences.currency)} max={10000000} value={preferences.budget ?? ""} onChange={(event) => updatePreferences({ budget: event.target.value === "" ? null : Number(event.target.value) })} /></label><label className="field"><span>Day</span><input required type="date" min={zonedNow(preferences.timeZone).date} value={preferences.date} onChange={(event) => updatePreferences({ date: event.target.value })} /></label><label className="field"><span>Start time</span><input required type="time" value={preferences.startTime} onChange={(event) => updatePreferences({ startTime: event.target.value, endTime: "" })} /></label><Button disabled={busy}>{busy ? "Checking this date…" : "Check and save changes"}</Button></form> : <p role="status">{busy ? "Opening your saved preferences…" : "Your original date is unchanged."}</p>)}
        {mode === "feedback" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); const parsed = dateFeedbackSchema.safeParse({ dateId: date.id, attended: attended === "yes", relevance: Number(relevance), ...(attended === "yes" ? { enjoyment: Number(enjoyment), costAccuracy } : {}) }); if (!attended || !parsed.success) { setMessage("Please complete the feedback fields."); return; } void saveAction(parsed.data, "/api/date-feedback"); }}><p>Your feedback stays private. It is not published as a review or testimonial.</p><label className="field"><span>Did this date happen?</span><select required value={attended} onChange={(event) => setAttended(event.target.value)}><option value="" disabled>Choose an answer</option><option value="yes">Yes, we went</option><option value="no">No, it hasn&apos;t happened</option></select></label><label className="field"><span>How well did the recommendation fit? (1–5)</span><input required type="number" min={1} max={5} value={relevance} onChange={(event) => setRelevance(event.target.value)} /></label>{attended === "yes" && <><label className="field"><span>How much did you enjoy it? (1–5)</span><input required type="number" min={1} max={5} value={enjoyment} onChange={(event) => setEnjoyment(event.target.value)} /></label><label className="field"><span>How did the costs compare?</span><select required value={costAccuracy} onChange={(event) => setCostAccuracy(event.target.value)}><option value="" disabled>Choose an answer</option><option value="accurate">Close to the estimate</option><option value="higher">Higher than expected</option><option value="lower">Lower than expected</option><option value="unknown">No estimate to compare</option></select></label></>}<Button disabled={busy}>Save private feedback</Button></form>}
        {message && <p role="alert" className="error-message">{message}</p>}
      </div>
    </Dialog>
    {(message || shareNotice) && mode === null && !deleteOpen && !publishOpen && <p role="status">{message || shareNotice}</p>}
  </div>;
}

function BackupVenue({ place, label }: { place: BackupPlace; label: string }) {
  return <div className={styles.backupVenue}>
    <p>{label}</p>
    <h3>{place.name}</h3>
    <p>{place.address}</p>
    <a href={place.mapsUrl} target="_blank" rel="noreferrer">View on Google Maps ↗</a>
    {place.attributions.map(({ name, url }, index) => <small key={`${name}:${index}`}>{url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : name}</small>)}
    <p>Confirm opening hours, prices and availability with the venue.</p>
  </div>;
}
