"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { publicInvitationSchema, type PublicInvitation } from "@/lib/planner/invitations";
import { dateTimingLabel } from "@/lib/planner/date-story";
import { readPlanningResponse } from "@/lib/firebase/planner-client";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import { Button } from "@/components/ui/button";
import { ChosenPlaceCard } from "./chosen-place-card";
import { DateStoryView } from "./date-story-view";
import styles from "./date-journey.module.css";

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
        if (!controller.signal.aborted) setInvitation(data);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "This invitation couldn't be opened."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [token, revision]);
  async function respond(response: "accepted" | "declined") {
    if (replyController.current || !invitation || invitation.response !== "pending") return;
    const controller = new AbortController(); replyController.current = controller;
    setReplying(true); setError("");
    try {
      const result = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }), signal: controller.signal });
      const data = z.object({ response: z.enum(["accepted", "declined"]) }).parse(await readPlanningResponse(result, () => {}));
      if (!controller.signal.aborted) setInvitation((previous) => previous ? { ...previous, response: data.response } : previous);
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your response couldn't be saved. Try again."); }
    finally { if (!controller.signal.aborted) { replyController.current = null; setReplying(false); } }
  }
  const accepted = invitation?.response === "accepted";
  const completed = invitation?.dateStatus === "completed";
  return <div className={styles.invitationPage}><header className={styles.header}><Link href="/" aria-label="a date at las home" title="adal — a date at las">adal<span>.</span></Link><span>A LITTLE SOMETHING FOR YOU</span></header>
    {loading ? <main className={styles.loading}><AtlasCompanion pose="concierge" lively label="Opening your invitation" /><p role="status">A little thought. Just for you.</p></main> : !invitation ? <main className={styles.loading}><h1>A little detour.</h1><p className="error-message" role="alert">{error}</p><Button onClick={() => { setLoading(true); setError(""); setRevision((value) => value + 1); }}>Try again</Button><Link href="/">Plan a date of your own ↗</Link></main> : <main className={`${styles.reveal} ${accepted ? styles.accepted : ""}`}>
      <div className={styles.revealIntro}><AtlasCompanion pose={accepted || completed ? "review" : "discover"} lively width={130} height={110} reactionKey={invitation.response} label={accepted ? "Atlas celebrates your yes" : "Atlas has a date invitation for you"} /><span className={styles.eyebrow}>{completed ? "A MEMORY FOR TWO" : accepted ? "ONE VERY GOOD YES" : "YOU'VE BEEN THOUGHT OF"}</span><h1>{completed ? "A little memory, kept." : accepted ? "It’s a date." : invitation.response === "declined" ? "Another time, perhaps." : "Will you go on this date with me?"}</h1><p>{completed ? "This date has been marked as done. A little story to keep." : accepted ? "A lovely little plan, and someone who wants to share it with you." : invitation.response === "declined" ? "Your response has been saved. Good moments are worth finding the right time for." : "Someone put a little thought into your next moment together."}</p><span className={styles.timing}>{dateTimingLabel(invitation.datePreference, invitation.startTime, completed)} · {invitation.city}</span></div>
      <div className={styles.chosenStage}><span className={styles.orbit} aria-hidden="true" /><ChosenPlaceCard key={invitation.place?.photo?.url ?? invitation.placeId} place={invitation.place} placeId={invitation.placeId} animated /></div>
      <section className={styles.sharePanel} aria-label="Respond to your date invitation">{invitation.response === "pending" && !completed ? <><h2>What do you say?</h2><div className={styles.actions}><Button disabled={replying} onClick={() => void respond("accepted")}>{replying ? "Saving your response…" : "Yes, I'd love to"}</Button><Button variant="outline" disabled={replying} onClick={() => void respond("declined")}>Maybe another time</Button></div></> : <p className={styles.responseStatus} role="status">{completed ? "This date is saved as a memory." : accepted ? "Your yes is saved. Now agree on the exact day together." : "Your response has been saved."}</p>}{error && <><p className="error-message" role="alert">{error}</p><button type="button" className={styles.textButton} onClick={() => { setError(""); setRevision((value) => value + 1); }}>Refresh invitation</button></>}</section>
      <DateStoryView story={invitation.story} label="A LITTLE PREVIEW OF YOUR DATE" /><Link className={styles.historyLink} href="/">Explore a date at las ↗</Link>
    </main>}
  </div>;
}
