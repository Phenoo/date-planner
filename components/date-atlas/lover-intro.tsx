"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { supportEmail } from "@/lib/seo/site";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import styles from "./lover-intro.module.css";
import { useSlideAdvance } from "@/components/animations/use-slide-advance";

const storySlideIntervalMs = 6000;

const storyCards = [
  { kicker: "A LITTLE INPUT. A LOT OF THOUGHT.", title: "Good dates don't have to be hard to plan.", body: "We connect the details. You enjoy the company.", art: "companion" },
  { kicker: "01 / TELL US YOUR VIBE", title: "Your kind of together.", body: "Your time, your budget, and the little things they love. That's where we start.", art: "vibe" },
  { kicker: "02 / CONNECT THE LITTLE DETAILS", title: "A plan that feels like you.", body: "Thoughtful places, practical timing, and a comfortable budget. All coming together.", art: "route" },
  { kicker: "03 / MAKE A MEMORY", title: "Less planning. More being there.", body: "Bring your favorite person. Leave a little room for something lovely.", art: "together" },
] as const;

export function LoverIntro({ onContinue, onResume }: { onContinue: () => void; onResume?: () => void }) {
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { reduced, visible } = useSlideAdvance(slide, storySlideIntervalMs, paused || hovered, () => setSlide((value) => (value + 1) % storyCards.length));
  const still = reduced || !visible;
  const card = storyCards[slide];

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main id="date-ideas" className={`${styles.intro} ${still ? styles.still : ""}`}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.glow} />
        <div className={styles.grid} />
        <div className={styles.orbit}><span /><span /><span /></div>
        <span className={styles.backgroundWord}>together.</span>
        <div className={styles.spark} /><div className={`${styles.spark} ${styles.sparkTwo}`} />
      </div>

      <div className={styles.layout}>
        <section className={styles.copy} aria-labelledby="lover-intro-heading">
          <div className={styles.kicker}><span />BEFORE WE PLAN SOMETHING GOOD</div>
          <h1 ref={heading} tabIndex={-1} id="lover-intro-heading" className={styles.title}>
            <span className={styles.line}><span>Are you a</span></span><span className={styles.line}><span>real <span className={styles.underlined}>lover?</span></span></span>
          </h1>
          <p className={styles.description}>The thoughtful kind. The “I planned something for us” kind. The little-things-mean-everything kind.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={pending} aria-busy={pending} onClick={() => startTransition(onResume ?? onContinue)}>{onResume ? "Continue planning" : "Let's plan a date"}{pending && <span aria-hidden="true"><i className={styles.spinner} /></span>}</button>
            {onResume && <button type="button" className={styles.newPlan} disabled={pending} onClick={() => startTransition(onContinue)}>Plan a new date</button>}
          </div>
          <p className="sr-only">Good dates don&apos;t have to be hard to plan. Tell us your vibe, time, and budget. We connect the details so you can enjoy the company and make a memory.</p>
        </section>

        <section id="how-it-works" className={styles.art} aria-label="Date planning stories" aria-roledescription="carousel" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onPointerMove={(event) => {
          if (still || event.pointerType !== "mouse") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--tilt-x", `${((event.clientY - bounds.top) / bounds.height - .5) * -9}deg`);
          event.currentTarget.style.setProperty("--tilt-y", `${((event.clientX - bounds.left) / bounds.width - .5) * 9}deg`);
        }} onPointerLeave={(event) => {
          event.currentTarget.style.removeProperty("--tilt-x");
          event.currentTarget.style.removeProperty("--tilt-y");
        }}>
          <div className={styles.artHalo} />
          <div className={styles.parallax}>
            <div className={styles.postcardBack} />
            <div className={styles.postcard} tabIndex={0} onFocus={() => setPaused(true)} onPointerDown={() => setPaused(true)}>
              <div key={card.art} className={`${styles.flipPanel} ${card.art === "vibe" ? styles.vibe : card.art === "together" ? styles.together : ""}`} role="group" aria-roledescription="slide" aria-label={`${slide + 1} of ${storyCards.length}`} aria-live={paused ? "polite" : "off"}>
                <div className={styles.postcardTop}><span>{card.kicker}</span><span>{String(slide + 1).padStart(2, "0")} / 04</span></div>
                <div className={styles.storyArt}>
                  {card.art === "companion" ? <AtlasCompanion pose="preferences" eager label="Oge helps connect the little details" width="100%" height="100%" playing={!still && !paused} />
                    : card.art === "vibe" ? <div className={styles.vibeTags}><span>YOUR VIBE</span><span>YOUR TIME</span><span>YOUR BUDGET</span></div>
                      : card.art === "route" ? <div className={styles.routeArt}><span>01</span><i /><span>02</span><i /><span>03</span></div>
                        : <div className={styles.togetherArt}>you<span>+</span>me</div>}
                </div>
                <div className={styles.storyCopy}><h2>{card.title}</h2><p>{card.body}</p></div>
                <div className={styles.postcardBottom}><span>THOUGHTFULLY PLANNED</span><span>A Date At las.</span></div>
              </div>
            </div>
          </div>
          <div className={styles.slideControls} aria-label="Story controls"><button type="button" aria-label="Previous story" onClick={() => { setPaused(true); setSlide((value) => (value + storyCards.length - 1) % storyCards.length); }}>←</button><span>{slide + 1} / {storyCards.length}</span><button type="button" aria-label="Next story" onClick={() => { setPaused(true); setSlide((value) => (value + 1) % storyCards.length); }}>→</button>{!reduced && <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? "Play stories" : "Pause stories"}</button>}</div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.chapter}><span /><small>A Date At las</small></div>
        <div className={styles.footerLinks}><Link href="/about">About</Link><Link href="/partners">Partner with us</Link><a href={`mailto:${supportEmail}`}>Support</a><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      </footer>
    </main>
  );
}
