"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { createdInvitationSchema, pendingInvitationKey, readPendingInvitation } from "@/lib/planner/invitations";
import { dateTimingLabel, fallbackDateStory } from "@/lib/planner/date-story";
import type { NearbyResult } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { Button } from "@/components/ui/button";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import { VenueDetails } from "./venue-details";
import { VenuePhotos } from "./venue-photos";
import { ReportVenue } from "./report-venue";
import { ReadyForDate } from "./ready-for-date";
import { VenueDecisionFacts } from "./venue-decision-facts";
import { DateReminderDialog } from "./date-reminder-dialog";
import { InvitationComposer } from "./invitation-composer";
import { funnelScope } from "@/lib/planner/funnel-client";
import styles from "./date-journey.module.css";

const selectionStatusSchema = z.object({ saved: z.boolean(), selection: createdInvitationSchema.nullable() });

async function invitationRequest(body: object, signal: AbortSignal) {
  const result = await plannerFetch("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
  });
  return readPlanningResponse(result, () => {});
}

export function ChosenDateReveal({ place, sessionId, request, signedIn, onChange, onSignIn }: {
  place: NearbyResult["places"][number]; sessionId?: string; request: PlanRequest; signedIn: boolean; onChange: () => void;
  onSignIn: (action: "save" | "invite", prepare: () => void) => void;
}) {
  const [savedDate, setSavedDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [retry, setRetry] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviterName, setInviterName] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderSendAt, setReminderSendAt] = useState("");
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!signedIn || !sessionId) return;
    const controller = new AbortController();
    const { signal } = controller;
    const choice = { sessionId, placeId: place.id };
    async function keepDate() {
      try {
        try {
          const resume = readPendingInvitation(sessionStorage.getItem(pendingInvitationKey), sessionId, place.id);
          if (resume === "create") setInviteOpen(true);
          if (resume) sessionStorage.removeItem(pendingInvitationKey);
        } catch { /* The date can still be kept in this tab. */ }
        const existing = selectionStatusSchema.parse(await invitationRequest({ action: "selection", ...choice }, signal));
        if (!existing.saved) {
          createdInvitationSchema.parse(await invitationRequest({ action: "save", ...choice, flowScope: funnelScope() }, signal));
        }
        if (signal.aborted) return;
        setSavedDate(true);
        if (existing.selection?.inviterName) setInviterName(existing.selection.inviterName);
      } catch (failure) {
        if (!signal.aborted) setSaveError(failure instanceof Error ? failure.message : "Your date couldn’t be saved. Try again.");
      } finally {
        if (!signal.aborted) setSaving(false);
      }
    }
    void Promise.resolve().then(() => {
      if (signal.aborted) return;
      setSaving(true);
      setSaveError("");
      void keepDate();
    });
    return () => controller.abort();
  }, [signedIn, sessionId, place.id, retry]);

  function requestAccess(action: "save" | "invite") {
    if (!sessionId) return;
    onSignIn(action, () => {
      try {
        localStorage.setItem(pendingInvitationKey, JSON.stringify({ sessionId, placeId: place.id, action: action === "invite" ? "create" : "save", expiresAt: Date.now() + 3600000 }));
      } catch { /* The current tab can still verify the email. */ }
    });
  }

  const story = place.story ?? fallbackDateStory(place.category);
  return <main className={styles.reveal} data-chosen-date>
    <div className={styles.revealIntro}><h1 ref={title} tabIndex={-1}>It feels like a date.</h1><p>{dateTimingLabel(request.datePreference, request.startTime, false, request.date)}</p></div>
    <div className={styles.chosenStage}><span className={styles.orbit} aria-hidden="true" /><ChosenPlaceCard place={place} placeId={place.id} animated showMapLink={false} /></div>
    <section className={styles.sharePanel} aria-label="Keep or share your date">
      <div className={styles.actions}>
        <Button disabled={!sessionId} onClick={() => signedIn ? setInviteOpen(true) : requestAccess("invite")}>Invite your date</Button>
        {!signedIn && <Button variant="outline" disabled={!sessionId} onClick={() => requestAccess("save")}>Save this date</Button>}
      </div>
      {signedIn && savedDate && <Link className={styles.historyLink} href="/saved">Saved in My dates ↗</Link>}
      {signedIn && saving && !savedDate && <p role="status">Saving to My dates…</p>}
      {signedIn && saveError && !savedDate && <p role="alert" className="error-message">{saveError} <button type="button" className={styles.textButton} onClick={() => setRetry((attempt) => attempt + 1)}>Try again</button></p>}
    </section>
    <ReadyForDate place={place} request={request} compact />
    {sessionId && <Button variant="ghost" className={styles.reminderAction} onClick={() => setReminderOpen(true)}>{reminderSendAt ? "Manage email reminder" : "Set an email reminder"}</Button>}
    <div className={styles.venueFacts}><VenueDecisionFacts place={place} request={request} /></div>
    <details className={styles.venueDisclosure}>
      <summary className={styles.textButton}>Venue photos and reviews</summary>
      <VenuePhotos key={place.id} place={place} />
      <VenueDetails place={place} request={request} />
      {sessionId && <ReportVenue placeId={place.id} sessionId={sessionId} />}
    </details>
    <DateStoryView story={story} category={place.category} label="HERE'S HOW YOUR DATE COULD UNFOLD" />
    <button type="button" className={styles.textButton} onClick={onChange}>Revisit your recommendation</button>
    {signedIn && inviteOpen && sessionId && <InvitationComposer initialName={inviterName} onClose={() => setInviteOpen(false)} onCreate={async (name, signal) => {
      const selection = createdInvitationSchema.parse(await invitationRequest({ action: "create", sessionId, placeId: place.id, inviterName: name, flowScope: funnelScope() }, signal));
      if (!signal.aborted) {
        setInviterName(selection.inviterName ?? name);
        setSavedDate(true);
      }
      return selection;
    }} />}
    <DateReminderDialog key={`reminder:${sessionId}:${place.id}:${signedIn}`} open={reminderOpen} onOpenChange={setReminderOpen} sessionId={sessionId} placeId={place.id} signedIn={signedIn} onSaved={setSavedDate} onScheduled={setReminderSendAt} />
  </main>;
}
