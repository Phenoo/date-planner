"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { LottieAnimation } from "@/components/animations/lottie-animation";
import type { CompanionTheme } from "@/lib/animations/registry";
import styles from "./planner-conversation.module.css";

export function PlannerReaction({ line, theme, onComplete }: { line: string; theme: CompanionTheme; onComplete: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const complete = useEffectEvent(onComplete);
  const characters = Array.from(line);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const length = Array.from(line).length;
    let skipTyping = motion.matches;
    let elapsed = 0;
    let previous: number | null = null;
    let displayed = 0;
    let frame = 0;
    let finished = false;

    function tick(now: number) {
      if (document.hidden || finished) return;
      if (previous !== null) elapsed += now - previous;
      previous = now;
      const typingDuration = skipTyping ? 0 : length * 30;
      const count = skipTyping ? length : Math.min(length, Math.floor(elapsed / 30));
      if (count !== displayed) { displayed = count; setVisibleCharacters(count); }
      if (elapsed >= typingDuration + 1200) { finished = true; complete(); return; }
      frame = window.requestAnimationFrame(tick);
    }

    function visibilityChanged() {
      window.cancelAnimationFrame(frame);
      previous = null;
      if (!document.hidden && !finished) frame = window.requestAnimationFrame(tick);
    }

    function motionChanged() {
      if (!motion.matches || skipTyping) return;
      skipTyping = true;
      elapsed = 0;
      previous = null;
    }

    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    motion.addEventListener("change", motionChanged);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibilityChanged);
      motion.removeEventListener("change", motionChanged);
    };
  }, [line]);

  return <main className={styles.screen} aria-label="A little response to your answer">
    <div className={styles.art} aria-hidden="true">
      <svg viewBox="70 55 340 280" fill="none" focusable="false"><path d="M240 130C202 66 125 82 120 141C115 199 188 238 240 288C292 238 365 199 360 141C355 82 278 66 240 130Z" pathLength="1" /></svg>
      <span /><span />
    </div>
    <div className={styles.copy}>
      <h1 ref={heading} tabIndex={-1} className={styles.phrase} aria-label={line} data-writing={visibleCharacters < characters.length}>
        <span aria-hidden="true">{characters.map((character, index) => <span key={index} className={styles.letter} data-visible={index < visibleCharacters} data-caret={index === visibleCharacters - 1}>{character}</span>)}</span>
      </h1>
    </div>
    <div className={styles.reactionAnimation} aria-hidden="true">
      <LottieAnimation key={theme} src={`/animations/reaction-hearts/${theme}.lottie`} fallback={`/animations/reaction-hearts/${theme}.svg`} label="Two hearts coming together" width="100%" height="100%" loop />
    </div>
  </main>;
}
