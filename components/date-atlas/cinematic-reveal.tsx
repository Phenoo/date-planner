"use client";
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
import styles from "./cinematic-reveal.module.css";

type Props = { place: NearbyResult["places"][number]; request: PlanRequest; catalogPlan?: DatePlan; busy: boolean; error: string; rejected: boolean; initialChapter?: number; onAccept: () => void; onReject: () => void; onEdit: () => void; onTiming: () => void };
const chapterNames = ["We heard you", "Your kind of together", "Comfort comes first", "The moment", "Our one pick", "The little details"];
const poses = ["discover", "preferences", "budget", "calendar", "celebration", "review"] as const;

export function CinematicReveal({ place, request, catalogPlan, busy, error, rejected, initialChapter = 0, onAccept, onReject, onEdit, onTiming }: Props) {
  const [chapter, setChapter] = useState(initialChapter);
  const [photoFailed, setPhotoFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const screen = useRef<HTMLElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const budget = request.budget === null ? null : request.budget * (request.budgetType === "per-person" ? request.guests : 1);
  const titles = ["Not just any date.", "A little more you.", "Good times. Comfortable choices.", request.date ? `${calendarLabel(request.date, { weekday: "long" })}. Made for two.` : "Your moment, considered.", "Meet your next memory.", "Does this feel like you?"];
  const descriptions = [
    `${request.city}. ${request.occasion}. ${request.guests} ${request.guests === 1 ? "person" : "people"}. The little details made a difference.`,
    `You chose ${request.vibes.map((vibe) => vibe.toLowerCase()).join(", ")}. We looked for a place to make that kind of together possible.`,
    catalogPlan ? `Your catalog-based estimate is ${money(catalogPlan.total)}, including the selected costs and allowances. ${budget === null ? "No spending ceiling has been set." : `It stays within your ${money(budget)} ceiling.`} Final prices need venue confirmation.` : budget === null ? "You left the budget open. You still get to decide what feels comfortable before committing." : `Your complete spending ceiling is ${money(budget)}${request.includeTransport ? ", including transport" : ""}. Venue prices still need confirmation; your limit stays yours.`,
    request.date && request.startTime ? `${calendarLabel(request.date)} at ${clockLabel(timeMinutes(request.startTime))}. ${request.duration / 60} hours to make a little memory. ${catalogPlan || place.details?.opening === "fits" ? "The listed hours fit your visit." : "We'll leave the final hours check with the venue."}` : "Choose your day and time before committing to the visit.",
    place.reason,
    "One thoughtful possibility. Take a closer look, then trust your feeling.",
  ];
  useEffect(() => {
    if (busy) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [busy]);
  useEffect(() => {
    screen.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [chapter]);
  function move(next: number) { setChapter(Math.max(0, Math.min(chapterNames.length - 1, next))); }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("button,a,input,summary")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); move(chapter + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(chapter - 1); }
  }
  if (busy) return <GeneratingScreen stage="Finding one different place, with your preferences intact" theme="red" />;
  return <main ref={screen} className={styles.screen} data-chapter={chapter} aria-label="Your one perfect pick" onKeyDown={keyDown}
    onPointerDown={(event) => { if (!(event.target instanceof Element && event.target.closest("button,a,input,summary"))) pointer.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={(event) => { const start = pointer.current; pointer.current = null; if (start && Math.abs(event.clientX - start.x) > 70 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.5) move(chapter + (event.clientX < start.x ? 1 : -1)); }} onPointerCancel={() => { pointer.current = null; }}>
    <div className={styles.backdrop} aria-hidden="true"><div className={styles.morph} /><svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice"><path d="M-80 710C280 900 760 700 540 400S180 70 500 90 1070 290 1320 70" /></svg><span>together.</span></div>
    <header className={styles.header}><span className={styles.logo}>adal<span>.</span></span><span className={styles.headerNote}>ONE PLACE. THOUGHTFULLY CHOSEN.</span><button type="button" onClick={onEdit}>Edit answers ↗</button></header>
    <nav className={styles.progress} aria-label="Your reveal chapters">{chapterNames.map((name, index) => <button type="button" key={name} aria-label={name} aria-current={chapter === index ? "step" : undefined} data-complete={chapter >= index} onClick={() => move(index)}><span /></button>)}</nav>
    {rejected && error ? <section className={`${styles.scene} ${styles.errorScene}`}><span className={styles.eyebrow}>A LITTLE MORE THOUGHT</span><h1 ref={heading} tabIndex={-1}>Let&apos;s find your kind of yes.</h1><p role="alert">{error}</p><div className={styles.actions}><Button className={styles.primary} onClick={onReject}>Try one replacement</Button><Button className={styles.secondary} variant="outline" onClick={onEdit}>Change preferences</Button></div></section> : <>
      <section key={chapter} className={`${styles.scene} ${chapter >= 4 ? styles.revealScene : ""} ${chapter === 5 ? styles.detailScene : ""}`}>
        <div className={styles.copy}><span className={styles.eyebrow}>{chapterNames[chapter]}</span><h1 ref={heading} tabIndex={-1} aria-label={titles[chapter]}>{titles[chapter].split(" ").map((word, index) => <span className={styles.word} aria-hidden="true" key={`${word}:${index}`}><span style={{ "--word": index } as CSSProperties}>{word}&nbsp;</span></span>)}</h1><p>{descriptions[chapter]}</p>
          {chapter === 1 && <div className={styles.vibes}>{request.vibes.slice(0, 4).map((vibe, index) => <span key={vibe} style={{ "--word": index } as CSSProperties}>{vibe}</span>)}</div>}
          {chapter === 2 && <div className={styles.budget}><span>{budget === null ? "A LITTLE FREEDOM" : "YOUR TOTAL CEILING"}</span><strong>{budget === null ? "Comfort first." : money(budget)}</strong><small>{place.details?.price ? "Provider spend range available. Final costs need confirmation." : "A budget target, not a venue price quote."}</small></div>}
          {chapter === 3 && <button type="button" className={styles.timing} onClick={onTiming}><span>{request.date ? calendarLabel(request.date, { month: "short", day: "numeric" }) : "Choose a day"}</span><strong>{request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time"}</strong><small>Change day or time ↗</small></button>}
        </div>
        {chapter >= 4 && <div className={styles.place}>
          <div className={styles.photo}>{place.photo && !photoFailed ? <><Image src={place.photo.url} alt={catalogPlan ? "Illustrative date atmosphere" : `A view of ${place.name}`} fill unoptimized priority sizes="(max-width:700px) 90vw, 52vw" onError={() => setPhotoFailed(true)} /><div className={styles.photoCredit}>{catalogPlan && <span>{catalogPlan.demo ? "Demonstration · illustrative photography" : "Illustrative photography"}</span>}{place.photo.authors.map((author, index) => author.url ? <a key={index} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={index}>Photo: {author.name}</span>)}</div></> : <div className={styles.poster}><span>YOUR NEXT GOOD STORY</span><strong>{place.name.charAt(0)}</strong><span>{catalogPlan?.demo ? "DEMONSTRATION EXPERIENCE" : "A REAL PLACE. A NEW POSSIBILITY."}</span></div>}</div>
          <div className={styles.placeName}><span>{place.category} · {request.city}</span><h2>{place.name}</h2>{place.details?.rating !== undefined && <small>{place.details.rating.toFixed(1)} / 5 · {place.details.reviewCount ?? 0} Google reviews</small>}</div>
        </div>}
        {chapter < 4 && <div className={styles.companion} aria-hidden="true"><span className={styles.companionHalo} /><AtlasCompanion pose={poses[chapter]} theme="red" lively reactionKey={chapter} width="100%" height="100%" /></div>}
        {chapter === 5 && <div className={styles.detailContent}>{catalogPlan ? <section className={styles.catalogFacts} aria-label="Catalog experience details"><h3>{catalogPlan.activities[0].experience.name}</h3><p>{catalogPlan.activities[0].experience.description}</p><div><span>Experience <strong>{money(catalogPlan.activityCost)}</strong></span><span>Transport estimate <strong>{money(catalogPlan.transportCost)}</strong></span><span>Contingency <strong>{money(catalogPlan.contingencyCost)}</strong></span><span>Estimated total <strong>{money(catalogPlan.total)}</strong></span></div><p>{catalogPlan.demo ? "Fictional demonstration venue and sample prices. No real-world bookings or reviews." : `Catalog source checked ${catalogPlan.activities[0].experience.verifiedAt ?? "date unavailable"}. ${catalogPlan.activities[0].experience.reservation} Reservation availability still needs venue confirmation.`}</p><p>Reviews are not available for this catalog record.</p>{!catalogPlan.demo && catalogPlan.activities[0].experience.sourceUrl && <a href={catalogPlan.activities[0].experience.sourceUrl} target="_blank" rel="noreferrer">View the venue source ↗</a>}</section> : <VenueDetails place={place} request={request} inverted />}{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.decision}><span>THERE&apos;S NO COMMITMENT YET.</span><h2>Your kind of yes?</h2><div className={styles.actions}><Button className={styles.primary} onClick={onAccept}>I love it</Button><Button className={styles.secondary} variant="outline" onClick={onReject}>Not my vibe</Button></div><button type="button" onClick={onTiming}>Change the date or time ↗</button></div></div>}
      </section>
      <footer className={styles.footer}><button type="button" className={styles.previous} disabled={chapter === 0} aria-label="Previous chapter" onClick={() => move(chapter - 1)}>←</button><span>{chapter === 5 ? "One place. Your decision." : "A little thought, every step of the way."}</span>{chapter < 5 ? <Button className={styles.primary} onClick={() => move(chapter + 1)}>{chapter === 3 ? "Reveal our pick" : chapter === 4 ? "Take a closer look" : "Keep going"}<span aria-hidden="true">→</span></Button> : <Button className={styles.primary} onClick={onAccept}>I love it</Button>}</footer>
    </>}
  </main>;
}
