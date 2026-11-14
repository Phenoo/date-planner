"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { invitationReplyResultSchema, publicInvitationSchema, type InvitationReplyResult, type PublicInvitation } from "@/lib/planner/invitations";
import { dateTimingLabel } from "@/lib/planner/date-story";
import { readPlanningResponse } from "@/lib/firebase/planner-client";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import { Button } from "@/components/ui/button";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import styles from "./date-journey.module.css";

import { InvitationSuggestions } from "./invitation-suggestions";
import { trackInvitationOpened } from "@/lib/planner/funnel-client";

export function InvitationPage({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [replying, setReplying] = useState(false);
  const replyController = useRef<AbortController | null>(null);
  useEffect(() => () => replyController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = publicInvitationSchema.parse(await readPlanningResponse(await fetch(`/api/invitations/${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal }), () => {}));
        if (!controller.signal.aborted) { setInvitation(data); trackInvitationOpened(token); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "This invitation couldn't be opened."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [token, revision]);
  const completed = invitation?.dateStatus === "completed";
  const canRespond = invitation?.response === "pending" && !completed && !invitation.suggestedTime && !invitation.suggestedVibe;
  async function respond(reply: InvitationReplyResult) {
    if (replyController.current || !canRespond || loading) return;
    const controller = new AbortController(); replyController.current = controller;
    setReplying(true); setError("");
    try {
      const body = "suggestedVibe" in reply ? { action: "suggest-vibe", vibe: reply.suggestedVibe }
        : "suggestedTime" in reply ? { action: "suggest", ...reply.suggestedTime }
        : reply;
      const result = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      const data = invitationReplyResultSchema.parse(await readPlanningResponse(result, () => {}));
      if (!controller.signal.aborted) setInvitation((previous) => previous ? { ...previous, ...data } : previous);
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your response couldn't be saved. Try again."); }
    finally { if (!controller.signal.aborted) { replyController.current = null; setReplying(false); } }
  }
  function refresh() {
    setLoading(true);
    setInvitation(null);
    setError("");
    setRevision((value) => value + 1);
  }
  const accepted = invitation?.response === "accepted";
  const suggestedTime = invitation?.suggestedTime;
  const suggestedVibe = invitation?.suggestedVibe;
  const suggestion = suggestedTime
    ? `You suggested ${dateTimingLabel("weekday", suggestedTime.startTime, false, suggestedTime.date)} (${suggestedTime.timeZone}).`
    : suggestedVibe ? `You suggested a different vibe: ${suggestedVibe}.` : "";
  return <div className={styles.invitationPage}><header className={styles.header}><Link href="/" aria-label="A Date At las home" title="adal — A Date At las">adal<span>.</span></Link><span>A LITTLE SOMETHING FOR YOU</span></header>
    {loading ? <main className={styles.loading}><AtlasCompanion pose="concierge" lively label="Opening your invitation" /><p role="status">A little thought. Just for you.</p></main> : !invitation ? <main className={styles.loading}><h1>A little detour.</h1><p className="error-message" role="alert">{error}</p><Button onClick={refresh}>Try again</Button><Link href="/">Plan a date of your own ↗</Link></main> : <main className={`${styles.reveal} ${accepted ? styles.accepted : ""}`}>
      <div className={styles.revealIntro}><AtlasCompanion pose={accepted || completed ? "review" : "discover"} lively width={130} height={110} reactionKey={invitation.response} label={accepted ? "Atlas celebrates your yes" : "Atlas has a date invitation for you"} /><span className={styles.eyebrow}>{completed ? "A MEMORY FOR TWO" : accepted ? "ONE VERY GOOD YES" : "YOU'VE BEEN THOUGHT OF"}</span><h1>{completed ? "A little memory, kept." : accepted ? "It’s a date." : invitation.response === "declined" ? "Another time, perhaps." : "Will you go on this date with me?"}</h1><p>{completed ? "This date has been marked as done. A little story to keep." : accepted ? "A lovely little plan, and someone who wants to share it with you." : invitation.response === "declined" ? "Your response has been saved. Good moments are worth finding the right time for." : "Someone put a little thought into your next moment together."}</p><span className={styles.timing}>{dateTimingLabel(invitation.datePreference, invitation.startTime, completed, invitation.date)} · {invitation.city}</span></div>
      {invitation.message && <blockquote className={styles.personalNote}>{invitation.message}</blockquote>}
      <div className={styles.chosenStage}><span className={styles.orbit} aria-hidden="true" /><ChosenPlaceCard key={invitation.place?.photo?.url ?? invitation.placeId} place={invitation.place} placeId={invitation.placeId} catalog={invitation.source === "catalog"} animated /></div>
      <section className={styles.sharePanel} aria-labelledby="invitation-response">
        <h2 id="invitation-response">Plan together</h2>
        {canRespond && <>
          <div className={styles.actions}>
            <Button disabled={replying} onClick={() => void respond({ response: "accepted" })}>Yes, I&apos;d love to</Button>
            <Button variant="outline" disabled={replying} onClick={() => void respond({ response: "declined" })}>Decline invitation</Button>
          </div>
          <InvitationSuggestions timeZone={invitation.timeZone} busy={replying} onSuggest={(reply) => void respond(reply)} />
        </>}
        <p className={styles.responseStatus} role="status">
          {replying ? "Sending your reply…" : completed ? "This date is saved as a memory." : suggestion ? `${suggestion} The creator can review it and send you an updated invitation.` : accepted ? "Your yes is saved. Confirm any booking details with the venue." : invitation.response === "declined" ? "Your response has been saved." : ""}
        </p>
        {error && <><p className="error-message" role="alert">{error}</p><button type="button" className={styles.textButton} disabled={replying} onClick={refresh}>Refresh invitation</button></>}
      </section>
      {invitation.date && invitation.startTime && <a className={styles.historyLink} href={`/api/invitations/${encodeURIComponent(token)}/calendar`}>Add to calendar ↗</a>}
      <DateStoryView story={invitation.story} category={invitation.place?.category} label="A LITTLE PREVIEW OF YOUR DATE" /><Link className={styles.historyLink} href="/">Explore A Date At las ↗</Link>
    </main>}
  </div>;
}
