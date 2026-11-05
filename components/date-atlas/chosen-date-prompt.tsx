"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Bookmark, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./date-journey.module.css";

export function ChosenDatePrompt({ saved, saving, reminderSet, onSave, onRemind }: {
  saved: boolean; saving: boolean; reminderSet: boolean; onSave: () => void; onRemind: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [showArrow, setShowArrow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    const update = () => setShowArrow(!dismissed && document.documentElement.scrollHeight - window.innerHeight - window.scrollY > 32);
    const onScroll = () => { if (window.scrollY > 8) dismissed = true; update(); };
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement); observer.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(update);
    const timer = setTimeout(() => setReady(true), 7000);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);
  return <aside className={styles.keepPrompt} aria-label="Keep your date">
    {showArrow && <button type="button" className={styles.scrollCue} aria-label="Scroll to your date details" onClick={() => window.scrollBy({ top: window.innerHeight * .7, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ArrowDown size={24} aria-hidden="true" /></button>}
    {ready && <div className={styles.keepActions}>
      <Button disabled={saving || saved} onClick={onSave}><Bookmark size={17} aria-hidden="true" />{saved ? "Date saved" : saving ? "Saving…" : "Save this date"}</Button>
      <Button variant="outline" onClick={onRemind}><Mail size={17} aria-hidden="true" />{reminderSet ? "Reminder set" : "Email reminder"}</Button>
    </div>}
  </aside>;
}
