"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { createdInvitationSchema, publicInvitationSchema, pendingInvitationKey, readPendingInvitation } from "@/lib/planner/invitations";
import { z } from "zod";
import { dateTimingLabel, fallbackDateStory } from "@/lib/planner/date-story";
import type { NearbyResult } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { Button } from "@/components/ui/button";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import { VenueDetails } from "./venue-details";
import { ReportVenue } from "./report-venue";
import { RevokeInvitation } from "./revoke-invitation";
import { calendarLabel, clockLabel, timeMinutes } from "@/lib/planner/schedule";
import styles from "./date-journey.module.css";

export function ChosenDateReveal({ place, sessionId, request, signedIn, onChange, onSignIn, onTiming }: {
  place: NearbyResult["places"][number]; sessionId?: string; request: PlanRequest; signedIn: boolean; onChange: () => void; onSignIn: () => void; onTiming: () => void;
}) {
  const [selection, setSelection] = useState<{ id: string; token: string } | null>(null);
  const [savedDate, setSavedDate] = useState(false);
  const [saving, setSaving] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [response, setResponse] = useState<"pending" | "accepted" | "declined">("pending");
  const [checking, setChecking] = useState(false);
  const responseController = useRef<AbortController | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const actionController = useRef<AbortController | null>(null);
  const actionBusy = useRef(false);
  useEffect(() => { mounted.current = true; title.current?.focus({ preventScroll: true }); return () => { mounted.current = false; responseController.current?.abort(); actionController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!signedIn) { void Promise.resolve().then(() => { if (!controller.signal.aborted) setSaving(false); }); return () => controller.abort(); }
    async function save() {
      actionBusy.current = true;
      try {
        if (!sessionId) throw new Error("Please refresh your ideas before creating an invitation.");
        let resume: "create" | "save" | null = null;
        try { resume = readPendingInvitation(localStorage.getItem(pendingInvitationKey), sessionId, place.id); } catch { /* Existing invitations still load without browser storage. */ }
        const result = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: resume ?? "selection", sessionId, placeId: place.id }), signal: controller.signal });
        const raw = await readPlanningResponse(result, () => {});
        const existing = resume ? null : z.object({ saved: z.boolean(), selection: createdInvitationSchema.nullable() }).parse(raw);
        const data = resume === "create" ? createdInvitationSchema.parse(raw) : existing?.selection ?? null;
        if (resume === "save") createdInvitationSchema.parse(raw);
        if (!controller.signal.aborted) {
          setSelection(data); if (data) setResponse(data.response);
          setSavedDate(resume !== null || existing?.saved === true);
          if (resume) { try { localStorage.removeItem(pendingInvitationKey); } catch { /* The action is idempotent. */ } setNotice(resume === "save" ? "Saved privately to your account." : "Your invitation is ready. Choose how to send it below."); }
        }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your invitation couldn't be prepared. Please try again."); }
      finally { if (!controller.signal.aborted) { actionBusy.current = false; setSaving(false); } }
    }
    void save();
    return () => controller.abort();
  }, [signedIn, sessionId, place.id]);
  async function prepareInvitation(action: "create" | "save" = "create") {
    if (!signedIn) {
      if (sessionId) { try { localStorage.setItem(pendingInvitationKey, JSON.stringify({ sessionId, placeId: place.id, action, expiresAt: Date.now() + 3600000 })); } catch { /* The accepted date still returns after sign-in. */ } }
      onSignIn(); return;
    }
    if (actionBusy.current || saving) return;
    actionBusy.current = true;
    const controller = new AbortController(); actionController.current = controller;
    setSaving(true); setError(""); setNotice("");
    try {
      if (!sessionId) throw new Error("Please refresh your ideas before creating an invitation.");
      await planningToken();
      const result = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sessionId, placeId: place.id }), signal: controller.signal });
      const data = createdInvitationSchema.parse(await readPlanningResponse(result, () => {}));
      if (!controller.signal.aborted) { setSavedDate(true); if (action === "create") { setSelection(data); setResponse(data.response); } setNotice(action === "save" ? "Saved privately to your account." : "Your invitation is ready. Choose how to send it below."); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your invitation couldn't be prepared. Please try again."); }
    finally { actionBusy.current = false; if (!controller.signal.aborted) setSaving(false); }
  }
  const story = place.story ?? fallbackDateStory(place.category);
  const inviteUrl = () => signedIn && selection ? `${window.location.origin}/invite/${selection.token}` : "";
  async function share(copy = false) {
    if (!signedIn) { onSignIn(); return; }
    const url = inviteUrl();
    if (!url) return;
    setError(""); setNotice("");
    try {
      if (!copy && navigator.share) await navigator.share({ title: "A date, just us two.", text: "I've planned a little something for us. Will you come?", url });
      else { await navigator.clipboard.writeText(url); if (mounted.current) setNotice("Invitation link copied. Send it to your date."); }
    } catch (failure) { if (mounted.current && !(failure instanceof Error && failure.name === "AbortError")) setError("Sharing didn't open. Copy the invitation link below instead."); }
  }
  async function checkResponse() {
    if (!signedIn || !selection || checking) return;
    const controller = new AbortController(); responseController.current?.abort(); responseController.current = controller;
    setChecking(true); setError("");
    try {
      const data = publicInvitationSchema.parse(await readPlanningResponse(await fetch(`/api/invitations/${selection.token}`, { cache: "no-store", signal: controller.signal }), () => {}));
      if (!controller.signal.aborted) { setResponse(data.response); setNotice(data.response === "pending" ? "Your date hasn't responded yet." : ""); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { if (!controller.signal.aborted) setChecking(false); }
  }
  return <main className={styles.reveal}>
    <div className={styles.revealIntro}><AtlasCompanion pose="review" lively width={120} height={100} label="Atlas celebrates your chosen date" /><span className={styles.eyebrow}>YOUR DATE, THOUGHTFULLY PLANNED</span><h1 ref={title} tabIndex={-1}>It feels like a date.</h1><p>{request.date ? `${calendarLabel(request.date)} · ${clockLabel(timeMinutes(request.startTime))}` : dateTimingLabel(request.datePreference, request.startTime)}</p><button type="button" className={styles.textButton} onClick={onTiming}>Change day or time ↗</button></div>
    <div className={styles.chosenStage}><span className={styles.orbit} aria-hidden="true" /><ChosenPlaceCard place={place} placeId={place.id} animated /></div>
    <section className={styles.sharePanel} aria-label="Invite your date"><h2>Now, make their day.</h2><p>{signedIn ? "Send a little invitation. They can say yes right from the link." : "Create an account or sign in to share this invitation and keep your dates together."}</p>
      <Button variant="outline" disabled={signedIn && (saving || savedDate)} onClick={() => void prepareInvitation("save")}>{savedDate && signedIn ? "Saved to My dates" : "Save this date"}</Button>
      <p>Anyone with the link can see the chosen venue, day, time and date story, and respond. Your private preferences and account details stay private. You can revoke the link at any time.</p>
      {!signedIn ? <Button onClick={() => void prepareInvitation()}>Sign in to create invitation</Button> : saving ? <p role="status">Checking your invitation…</p> : selection ? <><div className={styles.actions}><Button onClick={() => void share()}>Share with your date</Button><Button variant="outline" onClick={() => void share(true)}>Copy invitation link</Button></div><details className={styles.linkDetails}><summary>Show invitation link</summary><input aria-label="Your invitation link" readOnly value={inviteUrl()} onFocus={(event) => event.currentTarget.select()} /></details><div className={styles.responseStatus} role="status">{response === "accepted" ? "They said yes. It's a date." : response === "declined" ? "They'd prefer another time." : "Your invitation is ready."}</div>{response === "pending" && <button type="button" className={styles.textButton} disabled={checking} onClick={() => void checkResponse()}>{checking ? "Checking…" : "Check their response"}</button>}</> : <Button onClick={() => void prepareInvitation()}>Create invitation</Button>}
      {signedIn && error && <p className="error-message" role="alert">{error}</p>}{signedIn && notice && <p className={styles.notice} role="status">{notice}</p>}
      {signedIn && selection && <a className={styles.textButton} href={`https://wa.me/?text=${encodeURIComponent(`I've planned a little something for us. Will you come? ${inviteUrl()}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
      {signedIn && selection && <RevokeInvitation id={selection.id} onRevoked={() => { responseController.current?.abort(); setChecking(false); setSelection(null); setNotice("Invitation revoked. The old link no longer works."); }} />}
      {signedIn && savedDate && <Link className={styles.historyLink} href="/saved">Your dates are kept in My dates ↗</Link>}
    </section>
    <VenueDetails place={place} request={request} />
    {sessionId && <ReportVenue placeId={place.id} sessionId={sessionId} />}
    <DateStoryView story={story} label="HERE'S HOW YOUR DATE COULD UNFOLD" /><button type="button" className={styles.textButton} onClick={onChange}>Revisit your recommendation</button>
  </main>;
}
