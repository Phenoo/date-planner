"use client";
import { useEffect, useRef } from "react";
import type { PlannerMode } from "@/lib/planner/intake";
import styles from "./planner-chat.module.css";

export function PlannerModeChoice({ onChoose }: { onChoose: (mode: PlannerMode) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <main className={styles.choice}>
    <span className="eyebrow">YOUR DATE. YOUR WAY.</span>
    <h1 ref={heading} tabIndex={-1}>How would you<br />like to plan?</h1>
    <p>Talk it through, or take it one question at a time.</p>
    <div className={styles.modeCards}>
      <button type="button" onClick={() => onChoose("chat")}>
        <div className={styles.chatPreview} aria-hidden="true"><span>A little romantic. A little unexpected.</span><span>I like where this is going.</span><i /></div>
        <span className={styles.modeLabel}>LET’S TALK IT THROUGH</span><strong>Chat with the planner</strong><p>Describe your date in your own words. We’ll work out the details together.</p><span className={styles.modeAction}>Start a conversation <span aria-hidden="true">↗</span></span>
      </button>
      <button type="button" onClick={() => onChoose("steps")}>
        <div className={styles.stepsPreview} aria-hidden="true"><span>What’s your kind of date?</span><span>Romantic</span><span>Something playful</span></div>
        <span className={styles.modeLabel}>ONE LITTLE DETAIL AT A TIME</span><strong>Step by step</strong><p>A few thoughtful questions, with room to make every answer yours.</p><span className={styles.modeAction}>Take me through it <span aria-hidden="true">↗</span></span>
      </button>
    </div>
  </main>;
}
