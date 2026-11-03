"use client";
import { coverScreenSiblings } from "@/lib/planner/focus-screen";
import { useEffect, useRef } from "react";
import { WalkingCompanion } from "@/components/animations/walking-companion";
import type { CompanionTheme } from "@/lib/animations/registry";
import styles from "./cinematic-reveal.module.css";
import { Button } from "@/components/ui/button";
import { planningStageCopy } from "@/lib/planner/progress-copy";
export function GeneratingScreen({ stage = "Planning your date", onCancel }: { stage?: string; theme?: CompanionTheme; onCancel?: () => void }) {
  const screen = useRef<HTMLElement>(null);
  useEffect(() => { const uncover = coverScreenSiblings(screen.current); screen.current?.querySelector("button")?.focus({ preventScroll: true }); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = overflow; uncover(); }; }, []);
  return <main ref={screen} className={`${styles.screen} ${styles.loading}`} aria-busy="true" aria-label="Finding a date that suits you">
    <div className={styles.backdrop} aria-hidden="true"><div className={styles.morph} /><span>thoughtfully.</span></div>
    <header className={styles.header}><span className={styles.logo}>adal.</span><span className={styles.headerNote}>A LITTLE THOUGHT IN EVERY DETAIL</span></header>
    <span className={styles.eyebrow}>ONE PLACE. CHOSEN FOR YOU.</span>
    <h1>Let’s find your<br />kind of date.</h1>
    <p role="status">{planningStageCopy(stage)}</p>
    <div className={styles.loadingLine} aria-hidden="true" />
    <small>We’re checking real places against your choices. Your answers are kept if you stop.</small>
    {onCancel && <Button className={styles.secondary} variant="outline" onClick={onCancel}>Stop for now</Button>}
    <WalkingCompanion />
  </main>;
}
