"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./planner-conversation.module.css";

export function PlannerReaction({ line }: { line: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, []);
  return <main className={styles.screen} aria-label="A little response to your answer">
    <div className={styles.art} aria-hidden="true">
      <svg viewBox="70 55 340 280" fill="none" focusable="false"><path d="M240 130C202 66 125 82 120 141C115 199 188 238 240 288C292 238 365 199 360 141C355 82 278 66 240 130Z" pathLength="1" /></svg>
      <span /><span />
    </div>
    <div role="status" aria-live="polite" aria-atomic="true">
      <h1 ref={heading} tabIndex={-1} className={styles.phrase}>{line.split(/\s+/).map((word, index) => <span key={`${word}-${index}`} style={{ "--word-delay": `${index * 28}ms` } as CSSProperties}>{word}{" "}</span>)}</h1>
      <div className={styles.flourish} aria-hidden="true"><span /></div>
    </div>
  </main>;
}
