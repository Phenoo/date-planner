"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import { playRevealDrumRoll, revealDrumDurationMs } from "@/lib/animations/reveal-drum";
import styles from "./recommendation-ready.module.css";

export function RecommendationReady({ city, onContinue }: { city: string; onContinue: () => void }) {
  const [rolling, setRolling] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      stopAudio.current?.();
    };
  }, []);
  function startReveal() {
    if (timer.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onContinue(); return; }
    setRolling(true);
    if (soundOn) stopAudio.current = playRevealDrumRoll();
    timer.current = setTimeout(() => {
      stopAudio.current?.();
      stopAudio.current = null;
      onContinue();
    }, revealDrumDurationMs);
  }
  return <section className={styles.ready} data-rolling={rolling} aria-label="Your recommendation is ready" style={{ "--roll-duration": `${revealDrumDurationMs}ms` } as CSSProperties}>
    <div className={styles.art} aria-hidden="true">
      <div className={styles.orbit} /><div className={styles.orbit} /><div className={styles.orbit} />
      <div className={styles.ticket}>
        <span>ONE PICK. ALL YOU.</span>
        <svg viewBox="0 0 100 100" fill="none"><path d="M50 8L58 29L78 17L72 40L95 42L76 56L89 76L66 72L61 96L48 76L29 90L32 66L8 61L29 48L15 29L39 32Z" /><path d="M35 52L46 63L67 40" /></svg>
        <strong>adal.</strong><small>A DATE AT LAS</small>
      </div>
      <span className={styles.spark} /><span className={styles.spark} /><span className={styles.spark} />
    </div>
    <div className={styles.copy}>
      <span className={styles.eyebrow}>A LITTLE DRUM ROLL, PLEASE</span>
      <h1 ref={heading} tabIndex={-1} aria-label="We found something for you.">{["We found", "something", "for you."].map((line, index) => <span key={line} aria-hidden="true" style={{ "--line": index } as CSSProperties}>{line}</span>)}</h1>
      <p>Somewhere in {city}.<br />The beginning of a very good story.</p>
    </div>
    <div className={styles.controls}>
      <button className={styles.reveal} type="button" onClick={startReveal} disabled={rolling}>{rolling ? "Here it comes…" : "Reveal my date"}<ArrowRight size={20} aria-hidden="true" /></button>
      <button className={styles.sound} type="button" aria-label={soundOn ? "Mute drum roll" : "Enable drum roll"} aria-pressed={soundOn} onClick={() => { if (soundOn) { stopAudio.current?.(); stopAudio.current = null; } setSoundOn(!soundOn); }}>{soundOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}{soundOn ? "Sound on" : "Sound off"}</button>
    </div>
    <span className="sr-only" role="status">{rolling ? "Your date reveal is starting." : "Your recommendation is ready. Reveal your date or skip to the details."}</span>
  </section>;
}
