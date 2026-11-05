"use client";

import { useEffect, useState, type Ref } from "react";
import type { CompanionTheme } from "@/lib/animations/registry";
import appearance from "./planner-appearance.module.css";
import styles from "./planner-loading-screen.module.css";

type Props = {
  theme?: CompanionTheme;
  mode?: "opening" | "generating";
  context?: "home" | "planner";
  stage?: string;
  overlay?: boolean;
  screenRef?: Ref<HTMLElement>;
  onRetry?: () => void;
};

export function PlannerLoadingScreen({ theme = "red", mode = "opening", context = "planner", stage, overlay = false, screenRef, onRetry }: Props) {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setTakingLonger(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, []);

  const generating = mode === "generating";
  const message = generating ? "Finding your date..." : "Loading your date...";
  const characters = Array.from(message);
  const loopSeconds = 4;

  return (
    <main ref={screenRef} tabIndex={-1} className={`${appearance.palette} ${!generating ? appearance.initialPalette : ""} ${styles.screen} ${context === "home" ? styles.home : ""} ${overlay ? styles.overlay : ""}`} data-planner-theme={theme} aria-busy="true" aria-label={generating ? "Finding a date that suits you" : "Opening A Date At las"}>
      <div className={styles.marquee} aria-hidden="true" style={{ width: `${characters.length - 1}ch` }}>
        {characters.map((character, index) => <span key={index} className={styles.letter} style={{ animationDuration: `${loopSeconds}s`, animationDelay: `${loopSeconds / characters.length * (index - characters.length)}s` }}>{character}</span>)}
      </div>
      <p className={styles.status} role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">{stage ?? message}</span>{takingLonger && <span>Still working…</span>}</p>
      {takingLonger && onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Try again</button>}
    </main>
  );
}
