"use client";

import { useEffect, useState, type Ref } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

  return (
    <main ref={screenRef} className={`${appearance.palette} ${!generating ? appearance.initialPalette : ""} ${styles.screen} ${context === "home" ? styles.home : ""} ${overlay ? styles.overlay : ""}`} data-planner-theme={theme} aria-busy="true" aria-label={generating ? "Finding a date that suits you" : "Opening A Date At las"}>
      <div className={styles.backdrop} aria-hidden="true"><span /><span /></div>
      <header className={styles.header}>
        <span className={styles.logo} aria-label="A Date At las">adal<span>.</span></span>
        <span className={styles.headerNote}>A Date At las</span>
      </header>

      <div className={styles.content}>
        <div className={styles.art} aria-hidden="true">
          <div className={styles.orbit}><span /></div>
          <div className={styles.secondOrbit}><span /></div>
          <span className={styles.spark} />
          <div className={styles.heart}>
            <svg viewBox="0 0 160 160" focusable="false">
              <path className={styles.heartBody} d="M80 139C67 126 24 101 22 65 20 32 60 17 80 45 100 17 140 32 138 65 136 101 93 126 80 139Z" />
              <path className={styles.heartHighlight} d="M37 62C36 48 49 40 60 45" />
              <ellipse className={styles.face} cx="63" cy="77" rx="3" ry="4" />
              <ellipse className={styles.face} cx="97" cy="77" rx="3" ry="4" />
              <path className={styles.smile} d="M68 91Q80 103 92 91" />
            </svg>
          </div>
          <span className={styles.shadow} />
        </div>

        <span className={styles.eyebrow}>{generating ? "A LITTLE THOUGHT, JUST FOR YOU" : "A LITTLE LOVE IS ON ITS WAY"}</span>
        <h1 className={styles.title} tabIndex={-1}>{generating ? <>Finding your<br />kind of date.</> : <>A little thought.<br />Something lovely.</>}</h1>
        {context === "home" && <p className={styles.description}>Plan a thoughtful date around your city, budget and interests.</p>}
        <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
          <p className={styles.stage}>{stage ?? (generating ? "Looking for a date that suits you" : "Opening A Date At las…")}</p>
          {takingLonger && <p className={styles.slow}>This is taking longer than usual. Please keep this page open.</p>}
        </div>
        <div className={styles.dots} aria-hidden="true"><span /><span /><span /></div>
        {takingLonger && onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Try again<ArrowRight size={17} aria-hidden="true" /></button>}
      </div>

      <footer className={styles.footer}>{context === "home" ? <nav className={styles.publicLinks} aria-label="A Date At las links"><Link href="/plan">Plan a date</Link><Link href="/about">About</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav> : <><span /><small>Made for a little time together.</small><span /></>}</footer>
    </main>
  );
}
