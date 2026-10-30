"use client";
import { coverScreenSiblings } from "@/lib/planner/focus-screen";
import { useEffect, useRef } from "react";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import type { CompanionTheme } from "@/lib/animations/registry";
import styles from "./cinematic-reveal.module.css";
import { Button } from "@/components/ui/button";
export function GeneratingScreen({ stage = "Planning your date", onCancel }: { stage?: string; theme?: CompanionTheme; onCancel?: () => void }) {
  const screen = useRef<HTMLElement>(null);
  useEffect(() => { const uncover = coverScreenSiblings(screen.current); screen.current?.querySelector("button")?.focus({ preventScroll: true }); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = overflow; uncover(); }; }, []);
  return <main ref={screen} className={`${styles.screen} ${styles.loading}`} aria-busy="true" aria-label="Choosing your one perfect pick">
    <div className={styles.backdrop} aria-hidden="true"><div className={styles.morph} /><span>thoughtfully.</span></div>
    <header className={styles.header}><span className={styles.logo}>adal.</span><span className={styles.headerNote}>A LITTLE THOUGHT IN EVERY DETAIL</span></header>
    <div className={styles.loadingCharacter}><AtlasCompanion pose="concierge" theme="red" label="Atlas is thoughtfully preparing your date" width="100%" height="100%" lively /></div>
    <span className={styles.eyebrow}>ONE PLACE. CHOSEN FOR YOU.</span>
    <h1>A little thought.<br />A very good date.</h1>
    <p role="status">{stage}</p>
    <div className={styles.loadingLine} aria-hidden="true" />
    <small>Real places. Your details. One thoughtful possibility.</small>
    {onCancel && <Button className={styles.secondary} variant="outline" onClick={onCancel}>Cancel planning</Button>}
  </main>;
}
