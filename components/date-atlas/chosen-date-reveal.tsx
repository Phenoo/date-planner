"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { createdInvitationSchema, publicInvitationSchema } from "@/lib/planner/invitations";
import { dateTimingLabel, fallbackDateStory } from "@/lib/planner/date-story";
import type { NearbyResult } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { Button } from "@/components/ui/button";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import { VenueDetails } from "./venue-details";
import { calendarLabel, clockLabel, timeMinutes } from "@/lib/planner/schedule";
import styles from "./date-journey.module.css";

export function ChosenDateReveal({ place, sessionId, request, signedIn, onChange, onSignIn, onTiming }: {
  place: NearbyResult["places"][number]; sessionId?: string; request: PlanRequest; signedIn: boolean; onChange: () => void; onSignIn: () => void; onTiming: () => void;
}) {
  const [selection, setSelection] = useState<{ id: string; token: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [response, setResponse] = useState<"pending" | "accepted" | "declined">("pending");
  const [checking, setChecking] = useState(false);
  const responseController = useRef<AbortController | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; title.current?.focus({ preventScroll: true }); return () => { mounted.current = false; responseController.current?.abort(); }; }, []);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    async function save() {
      try {
        if (!sessionId) throw new Error("Please refresh your ideas before creating an invitation.");
        await planningToken();
        const result = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", sessionId, placeId: place.id }), signal: controller.signal });
        const data = createdInvitationSchema.parse(await readPlanningResponse(result, () => {}));
        if (!controller.signal.aborted) { setSelection(data); setResponse(data.response); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your invitation couldn't be prepared. Please try again."); }
      finally { if (!controller.signal.aborted) setSaving(false); }
    }
    void save();
    return () => controller.abort();
  }, [signedIn, sessionId, place.id, revision]);
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
      {!signedIn ? <Button onClick={onSignIn}>Sign in or create an account</Button> : saving ? <p role="status">Preparing your invitation…</p> : selection ? <><div className={styles.actions}><Button onClick={() => void share()}>Share with your date</Button><Button variant="outline" onClick={() => void share(true)}>Copy invitation link</Button></div><details className={styles.linkDetails}><summary>Show invitation link</summary><input aria-label="Your invitation link" readOnly value={inviteUrl()} onFocus={(event) => event.currentTarget.select()} /></details><div className={styles.responseStatus} role="status">{response === "accepted" ? "They said yes. It's a date." : response === "declined" ? "They'd prefer another time." : "Your invitation is ready."}</div>{response === "pending" && <button type="button" className={styles.textButton} disabled={checking} onClick={() => void checkResponse()}>{checking ? "Checking…" : "Check their response"}</button>}</> : <Button onClick={() => { setSaving(true); setError(""); setRevision((value) => value + 1); }}>Try again</Button>}
      {signedIn && error && <p className="error-message" role="alert">{error}</p>}{signedIn && notice && <p className={styles.notice} role="status">{notice}</p>}
      {signedIn && selection && <a className={styles.textButton} href={`https://wa.me/?text=${encodeURIComponent(`I've planned a little something for us. Will you come? ${inviteUrl()}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
      {signedIn && <Link className={styles.historyLink} href="/saved">Your dates are kept in My dates ↗</Link>}
    </section>
    <VenueDetails place={place} request={request} />
    <DateStoryView story={story} label="HERE'S HOW YOUR DATE COULD UNFOLD" /><button type="button" className={styles.textButton} onClick={onChange}>Revisit your recommendation</button>
  </main>;
}
