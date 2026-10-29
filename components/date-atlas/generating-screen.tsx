"use client";
import { useEffect } from "react";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import type { CompanionTheme } from "@/lib/animations/registry";
import styles from "./cinematic-reveal.module.css";
export function GeneratingScreen({ stage = "Planning your date" }: { stage?: string; theme?: CompanionTheme }) {
  useEffect(() => { const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = overflow; }; }, []);
  return <main className={`${styles.screen} ${styles.loading}`} aria-busy="true" aria-label="Choosing your one perfect pick">
    <div className={styles.backdrop} aria-hidden="true"><div className={styles.morph} /><span>thoughtfully.</span></div>
    <header className={styles.header}><span className={styles.logo}>adal.</span><span className={styles.headerNote}>A LITTLE THOUGHT IN EVERY DETAIL</span></header>
    <div className={styles.loadingCharacter}><AtlasCompanion pose="concierge" theme="red" label="Atlas is thoughtfully preparing your date" width="100%" height="100%" lively /></div>
    <span className={styles.eyebrow}>ONE PLACE. CHOSEN FOR YOU.</span>
    <h1>A little thought.<br />A very good date.</h1>
    <p role="status">{stage}</p>
    <div className={styles.loadingLine} aria-hidden="true" />
    <small>Real places. Your details. One thoughtful possibility.</small>
  </main>;
}
