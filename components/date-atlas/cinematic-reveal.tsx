"use client";
import { coverScreenSiblings } from "@/lib/planner/focus-screen";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import { calendarLabel, clockLabel, timeMinutes } from "@/lib/planner/schedule";
import type { NearbyResult } from "@/lib/maps/schema";
import type { DatePlan, PlanRequest } from "@/lib/planner/schema";
import { money } from "@/lib/utils";
import { VenueDetails } from "./venue-details";
import { GeneratingScreen } from "./generating-screen";
import { RecommendationReady } from "./recommendation-ready";
import styles from "./cinematic-reveal.module.css";

import { RejectionDialog, type RejectionReason } from "./rejection-dialog";
import { funnelScope, trackFunnel } from "@/lib/planner/funnel-client";

type Props = { place: NearbyResult["places"][number]; request: PlanRequest; catalogPlan?: DatePlan; busy: boolean; error: string; rejected: boolean; initialChapter?: number; onAccept: () => void; onCancelGeneration?: () => void; onReject: (reason: RejectionReason) => void; onEdit: () => void; onTiming: () => void };
const chapterNames = ["We heard you", "Our one pick", "The little details"];


export function CinematicReveal({ place, request, catalogPlan, busy, error, rejected, initialChapter = 0, onAccept, onCancelGeneration, onReject, onEdit, onTiming }: Props) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const lastReason = useRef<RejectionReason>("place");
  const eventScope = useRef(funnelScope(`recommendation:${place.id}`));
  function acceptPick() { trackFunnel("recommendation_accepted", eventScope.current); onAccept(); }
  function rejectPick(reason: RejectionReason) { lastReason.current = reason; trackFunnel("recommendation_rejected", eventScope.current, reason); onReject(reason); }
  const [chapter, setChapter] = useState(initialChapter);
  const [introComplete, setIntroComplete] = useState(initialChapter > 0);
  const revealFingerprint = JSON.stringify([place.id, request.date, request.startTime]);
  const [photoFailed, setPhotoFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const screen = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const titles = ["Not just any date.", "Meet your next memory.", "Does this feel like you?"];
  const descriptions = [
    `${request.city}. ${request.occasion}. ${request.guests} ${request.guests === 1 ? "person" : "people"}. A place for your ${request.vibes.map((vibe) => vibe.toLowerCase()).join(", ")} kind of together.`,
    place.reason,
    "One thoughtful possibility. Take a closer look, then trust your feeling.",
  ];
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem("date-atlas:reveal-opened:v1") || "null");
        if (active && stored && typeof stored === "object" && "fingerprint" in stored && stored.fingerprint === revealFingerprint && "expiresAt" in stored && typeof stored.expiresAt === "number" && stored.expiresAt > Date.now()) setIntroComplete(true);
      } catch { /* The reveal remains usable when storage is unavailable. */ }
    });
    return () => { active = false; };
  }, [revealFingerprint]);
  function finishIntro(next = 0) {
    try { sessionStorage.setItem("date-atlas:reveal-opened:v1", JSON.stringify({ fingerprint: revealFingerprint, expiresAt: Date.now() + 3600000 })); } catch { /* The current reveal continues without storage. */ }
    setIntroComplete(true);
    setChapter(next);
  }
  useEffect(() => {
    if (busy) return;
    const overflow = document.body.style.overflow;
    const uncover = coverScreenSiblings(screen.current);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; uncover(); };
  }, [busy]);
  useEffect(() => {
    if (busy) return;
    screen.current?.scrollTo({ top: 0 });
    if (introComplete) heading.current?.focus({ preventScroll: true });
  }, [chapter, introComplete, busy]);
  function move(next: number) { setChapter(Math.max(0, Math.min(chapterNames.length - 1, next))); }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (!introComplete) return;
    if (event.target instanceof Element && event.target.closest("button,a,input,summary")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); move(chapter + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(chapter - 1); }
  }
  if (busy) return <GeneratingScreen stage="Finding one different place, with your preferences intact" theme="red" onCancel={onCancelGeneration} />;
  return <main ref={screen} className={styles.screen} data-chapter={chapter} aria-label="Your one perfect pick" onKeyDown={keyDown}
    onPointerDown={(event) => { if (introComplete && !(event.target instanceof Element && event.target.closest("button,a,input,summary"))) pointer.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={(event) => { const start = pointer.current; pointer.current = null; if (start && Math.abs(event.clientX - start.x) > 70 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.5) move(chapter + (event.clientX < start.x ? 1 : -1)); }} onPointerCancel={() => { pointer.current = null; }}>
    <RejectionDialog open={rejectOpen} onOpenChange={setRejectOpen} radius={Math.max(1, Math.floor(request.maxDistance / 2))} onConfirm={rejectPick} />
    <div className={styles.backdrop} aria-hidden="true"><div className={styles.morph} /><svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice"><path d="M-80 710C280 900 760 700 540 400S180 70 500 90 1070 290 1320 70" /></svg><span>together.</span></div>
    <header className={styles.header}><span className={styles.logo}>adal<span>.</span></span><span className={styles.headerNote}>ONE PLACE. THOUGHTFULLY CHOSEN.</span><div className={styles.headerActions}>{chapter < 2 && <button type="button" onClick={() => introComplete ? move(2) : finishIntro(2)}>Skip to details</button>}<button type="button" onClick={onEdit}>Edit answers ↗</button></div></header>
    {introComplete && <nav className={styles.progress} aria-label="Your reveal chapters">{chapterNames.map((name, index) => <button type="button" key={name} aria-label={name} aria-current={chapter === index ? "step" : undefined} data-complete={chapter >= index} onClick={() => move(index)}><span /></button>)}</nav>}
    {!introComplete ? <RecommendationReady city={request.city} onContinue={() => finishIntro()} /> : rejected && error ? <section className={`${styles.scene} ${styles.errorScene}`}><span className={styles.eyebrow}>A LITTLE MORE THOUGHT</span><h1 ref={heading} tabIndex={-1}>Let&apos;s find your kind of yes.</h1><p role="alert">{error}</p><div className={styles.actions}><Button className={styles.primary} onClick={() => rejectPick(lastReason.current)}>Replace</Button><Button className={styles.secondary} variant="outline" onClick={onEdit}>Change preferences</Button></div></section> : <>
      <section key={chapter} className={`${styles.scene} ${chapter >= 1 ? styles.revealScene : ""} ${chapter === 2 ? styles.detailScene : ""}`}>
        <div className={styles.copy}><span className={styles.eyebrow}>{chapterNames[chapter]}</span><h1 ref={heading} tabIndex={-1} aria-label={titles[chapter]}>{titles[chapter].split(" ").map((word, index) => <span className={styles.word} aria-hidden="true" key={`${word}:${index}`}><span style={{ "--word": index } as CSSProperties}>{word}&nbsp;</span></span>)}</h1><p>{descriptions[chapter]}</p>
          {chapter === 0 && <div className={styles.vibes}>{request.vibes.slice(0, 4).map((vibe, index) => <span key={vibe} style={{ "--word": index } as CSSProperties}>{vibe}</span>)}</div>}
          {chapter === 1 && <button type="button" className={styles.timing} onClick={onTiming}><span>{request.date ? calendarLabel(request.date, { month: "short", day: "numeric" }) : "Choose a day"}</span><strong>{request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time"}</strong><small>Change day or time ↗</small></button>}
        </div>
        {chapter >= 1 && <div className={styles.place}>
          <div className={styles.photo}>{place.photo && !photoFailed ? <><Image src={place.photo.url} alt={catalogPlan ? "Illustrative date atmosphere" : `A view of ${place.name}`} fill unoptimized priority sizes="(max-width:700px) 90vw, 52vw" onError={() => setPhotoFailed(true)} /><div className={styles.photoCredit}>{catalogPlan && <span>{catalogPlan.demo ? "Demonstration · illustrative photography" : "Illustrative photography"}</span>}{place.photo.authors.map((author, index) => author.url ? <a key={index} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={index}>Photo: {author.name}</span>)}</div></> : <div className={styles.poster}><span>YOUR NEXT GOOD STORY</span><strong>{place.name.charAt(0)}</strong><span>{catalogPlan?.demo ? "DEMONSTRATION EXPERIENCE" : "A REAL PLACE. A NEW POSSIBILITY."}</span></div>}</div>
          <div className={styles.placeName}><span>{place.category} · {request.city}</span><h2>{place.name}</h2>{place.details?.rating !== undefined && <small>{place.details.rating.toFixed(1)} / 5 · {place.details.reviewCount ?? 0} Google reviews</small>}</div>
        </div>}
        {chapter === 0 && <div className={styles.companion} aria-hidden="true"><span className={styles.companionHalo} /><AtlasCompanion pose="discover" theme="red" lively reactionKey={chapter} width="100%" height="100%" /></div>}
        {chapter === 2 && <div className={styles.detailContent}>{catalogPlan ? <section className={styles.catalogFacts} aria-label="Catalog experience details"><h3>{catalogPlan.activities[0].experience.name}</h3><p>{request.date ? calendarLabel(request.date) : "Choose a day"} · {request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time"} · {request.duration / 60} hours · {request.guests} people · {request.timeZone}</p><p>{catalogPlan.activities[0].experience.description}</p><div><span>Experience <strong>{money(catalogPlan.activityCost)}</strong></span><span>Transport estimate <strong>{money(catalogPlan.transportCost)}</strong></span><span>Contingency <strong>{money(catalogPlan.contingencyCost)}</strong></span><span>Estimated total <strong>{money(catalogPlan.total)}</strong></span></div><p>{catalogPlan.demo ? "Fictional demonstration venue and sample prices. No real-world bookings or reviews." : `Catalog source checked ${catalogPlan.activities[0].experience.verifiedAt ?? "date unavailable"}. ${catalogPlan.activities[0].experience.reservation} Reservation availability still needs venue confirmation.`}</p><p>Reviews are not available for this catalog record.</p>{!catalogPlan.demo && catalogPlan.activities[0].experience.sourceUrl && <a href={catalogPlan.activities[0].experience.sourceUrl} target="_blank" rel="noreferrer">View the venue source ↗</a>}</section> : <VenueDetails place={place} request={request} inverted />}{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.decision}><span>THERE&apos;S NO COMMITMENT YET.</span><h2>Your kind of yes?</h2><div className={styles.actions}><Button className={styles.primary} onClick={acceptPick}>I love it</Button><Button className={styles.secondary} variant="outline" onClick={() => setRejectOpen(true)}>Not my vibe</Button></div><button type="button" onClick={onTiming}>Change the date or time ↗</button></div></div>}
      </section>
      <footer className={styles.footer}><button type="button" className={styles.previous} disabled={chapter === 0} aria-label="Previous chapter" onClick={() => move(chapter - 1)}>←</button><span>{chapter === 2 ? "One place. Your decision." : "A little thought, every step of the way."}</span>{chapter < 2 ? <Button className={styles.primary} onClick={() => move(chapter + 1)}>{chapter === 0 ? "Reveal our pick" : "Take a closer look"}<span aria-hidden="true">→</span></Button> : <Button className={styles.primary} onClick={acceptPick}>I love it</Button>}</footer>
    </>}
  </main>;
}
