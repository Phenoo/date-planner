"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import Image from "next/image";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import styles from "./planning-intro.module.css";
import { useSlideAdvance } from "@/components/animations/use-slide-advance";

const planningChapterIntervalMs = 6000;
const chapters = [
  { label: "A PLACE TO BEGIN", title: "Start with somewhere.", description: "Your city is just the beginning. Choose how far you’d love to go.", pose: "location" },
  { label: "THE LITTLE DETAILS", title: "Make it your kind of date.", description: "Tell Oge what you have in mind, by text or voice. A few questions work too. Set a budget, or leave it open.", pose: "preferences" },
  { label: "LET’S FIND YOUR PLACE", title: "We’ll help with the details.", description: "We’ll look for a place that fits, check the time and available costs, and let you decide if it feels right.", pose: "itinerary" },
] as const;

const dateMoments = [
  { image: "creative", title: "Make something.", detail: "A little creativity" },
  { image: "food-and-dining", title: "Share a table.", detail: "An easy conversation" },
  { image: "outdoors", title: "Take it slow.", detail: "A moment to remember" },
] as const;

function Title({ text }: { text: string }) {
  return <>{text.split(" ").map((word, index) => <span className={styles.wordMask} key={`${word}-${index}`}><span style={{ "--word-delay": `${index * 55}ms` } as CSSProperties}>{word}&nbsp;</span></span>)}</>;
}

export function PlanningIntro({ onStart }: { onStart: () => void }) {
  const [chapter, setChapter] = useState(0);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const ready = chapter === chapters.length;
  const current = chapters[Math.min(chapter, chapters.length - 1)];

  const { reduced, visible } = useSlideAdvance(chapter, planningChapterIntervalMs, ready, () => setChapter((value) => Math.min(chapters.length, value + 1)));
  const playing = visible && !reduced;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  return <main className={styles.screen} aria-label="Before you plan your date" data-chapter={chapter} data-paused={!playing}>
    <div className={styles.backdrop} aria-hidden="true">
      <span /><span /><span /><div className={styles.orbit} />
      {[styles.loveLeft, styles.loveRight, styles.loveBottom].map((placement) => <svg key={placement} className={`${styles.loveArt} ${placement}`} viewBox="70 55 340 280" fill="none" focusable="false">
        <path d="M240 130C202 66 125 82 120 141C115 199 188 238 240 288C292 238 365 199 360 141C355 82 278 66 240 130Z" />
        <path d="M133 145C130 112 158 91 186 103M250 279C299 233 351 199 349 153" />
      </svg>)}
    </div>
    <div className={styles.story}>
      <div className={styles.copy} aria-live="off" aria-atomic="true">
        <span className={styles.eyebrow}>{ready ? "YOUR TURN TO MAKE IT PERSONAL" : current.label}</span>
        <h1 ref={heading} tabIndex={-1}><span key={chapter}><Title text={ready ? "Ready to make their day?" : current.title} /></span></h1>
        <p key={`description-${chapter}`}>{ready ? "A few details from you. A thoughtful plan from us." : current.description}</p>
      </div>

      <div className={styles.artboard} aria-hidden="true">
        <div className={styles.halo} />
        {chapter === 0 ? <div className={styles.locationScene}>
          <div className={styles.mapPaper}>
            <span className={styles.paperLabel}>WHERE COULD THIS TAKE YOU?</span>
            <div className={styles.mapGrid} />
            <svg className={styles.route} viewBox="0 0 440 230" fill="none"><path d="M45 175C110 175 95 60 180 70S260 195 300 110 360 60 400 45" /><circle cx="45" cy="175" r="6" /><circle cx="400" cy="45" r="6" /></svg>
            <div className={styles.cityLabel}>Your city<span>A starting point, not a limit.</span></div>
          </div>
          <div className={`${styles.floatingNote} ${styles.exploreNote}`}>Somewhere new?</div>
          <div className={styles.locationCompanion}><AtlasCompanion pose="location" label="Oge finding possibilities" width="100%" height="100%" playing={playing} idle={false} /></div>
        </div> : chapter === 1 ? <div className={styles.detailsScene}>
          <div className={styles.detailCompanion}><AtlasCompanion pose="preferences" label="Oge getting to know your date" width="100%" height="100%" playing={playing} idle={false} /></div>
          <div className={`${styles.detailCard} ${styles.vibeCard}`}><span>YOUR VIBE</span><strong>A little creative.</strong><div className={styles.swatches}><i /><i /><i /></div></div>
          <div className={`${styles.detailCard} ${styles.timeCard}`}><span>YOUR TIME</span><strong>Make room for two.</strong><div className={styles.clock}><i /><i /></div></div>
          <div className={`${styles.detailCard} ${styles.budgetCard}`}><span>YOUR BUDGET</span><strong>Comfort comes first.</strong><small>Set a limit, or keep it open.</small></div>
          <span className={`${styles.floatingNote} ${styles.personalNote}`}>The little things they love.</span>
        </div> : <div className={`${styles.planScene} ${ready ? styles.settled : ""}`}>
          <div className={styles.planHeading}><span>A LITTLE OF WHAT’S POSSIBLE</span><span>MADE FOR TWO</span></div>
          <div className={styles.moments}>{dateMoments.map((moment, index) => <div className={styles.moment} key={moment.image} style={{ "--moment": index } as CSSProperties}>
            <Image src={`/illustrations/vibes/editorial-v2/${moment.image}.webp`} alt="" width={360} height={240} sizes="(max-width:700px) 30vw, 170px" />
            <span>{moment.detail}</span><strong>{moment.title}</strong>
          </div>)}</div>
          <div className={styles.planFooter}><span className={styles.routeDots}><i /><i /><i /></span><span>Connected around you.</span><div className={styles.planCompanion}><AtlasCompanion pose={current.pose} label="Oge connecting your plan" width="100%" height="100%" playing={playing && !ready} idle={false} /></div></div>
        </div>}
      </div>
    </div>

    <footer className={styles.footer}>
      <div className={styles.actionSlot}><button type="button" className={styles.start} disabled={pending} aria-busy={pending} onClick={() => startTransition(onStart)}>{pending ? "Opening your planner…" : "Start my date plan"}<span aria-hidden="true">→</span></button>
      </div>
    </footer>
  </main>;
}
