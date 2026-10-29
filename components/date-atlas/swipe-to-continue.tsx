"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import styles from "./swipe-to-continue.module.css";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function SwipeToContinue({ onContinue }: { onContinue: () => void }) {
  const hintId = useId();
  const rail = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; startX: number; travel: number } | null>(null);
  const completed = useRef(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  function complete() {
    if (completed.current) return;
    completed.current = true;
    setProgress(1);
    onContinue();
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || completed.current || gesture.current) return;
    const travel = (rail.current?.getBoundingClientRect().width ?? 0) - event.currentTarget.getBoundingClientRect().width;
    if (travel <= 0) return;
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, travel };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setProgress(clamp((event.clientX - active.startX) / active.travel));
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    if (!canceled && (event.clientX - active.startX) / active.travel >= .9) complete();
    else setProgress(0);
  }

  return <div className={styles.track} data-dragging={dragging}>
    <span className={styles.label} aria-hidden="true" style={{ opacity: Math.max(0, 1 - progress * 1.5) }}>Swipe to continue</span>
    <div ref={rail} className={styles.rail}>
      <button type="button" className={styles.handle} aria-label="Continue to a date at las" aria-describedby={hintId}
        style={{ left: `${progress * 100}%`, transform: `translateX(-${progress * 100}%)` }}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag}
        onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={(event) => finishDrag(event, true)}
        onClick={(event) => { if (event.detail === 0) complete(); }}>
        <span className={styles.cue} aria-hidden="true"><ArrowRight size={25} strokeWidth={2} /></span>
      </button>
    </div>
    <span id={hintId} className="sr-only">Swipe the arrow to the right, or press Enter or Space to continue.</span>
  </div>;
}
