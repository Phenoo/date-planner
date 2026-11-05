"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { PlannerMode } from "@/lib/planner/intake";
import styles from "./planner-chat.module.css";

const modes = [
  { value: "steps", label: "Step by step", title: "Step by step", description: "Place, vibe, budget and when. Add any extras if you want.", action: "Take me through it" },
  { value: "chat", label: "Chat", title: "Chat with the planner", description: "Type or speak your date ideas. We’ll work out the details together.", action: "Start a conversation" },
] as const;

export function PlannerModeChoice({ onChoose }: { onChoose: (mode: PlannerMode) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const [selected, setSelected] = useState<PlannerMode>("steps");
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % modes.length
      : event.key === "ArrowLeft" ? (index + modes.length - 1) % modes.length
      : event.key === "Home" ? 0 : event.key === "End" ? modes.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(modes[next].value);
    tabs.current[next]?.focus();
  }

  return <main className={styles.choice}>
    <span className="eyebrow">YOUR DATE. YOUR WAY.</span>
    <h1 ref={heading} tabIndex={-1}>How would you<br />like to plan?</h1>
    <p>Talk it through, or take it one question at a time.</p>
    <div className={styles.modeTabs} role="tablist" aria-label="Planning method">
      {modes.map((mode, index) => <button key={mode.value} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab" id={`${id}-${mode.value}-tab`} aria-selected={selected === mode.value} aria-controls={`${id}-${mode.value}-panel`} tabIndex={selected === mode.value ? 0 : -1} onClick={() => setSelected(mode.value)} onKeyDown={(event) => moveTab(event, index)}>{mode.label}</button>)}
    </div>
    <div className={styles.modePanels}>
      {modes.map((mode) => <section key={mode.value} className={styles.modeCard} role="tabpanel" id={`${id}-${mode.value}-panel`} aria-labelledby={`${id}-${mode.value}-tab`} hidden={selected !== mode.value} tabIndex={0}>
        {mode.value === "chat" ? <div className={styles.chatPreview} aria-hidden="true"><span>A little romantic. A little unexpected.</span><span>I like where this is going.</span><i /></div>
          : <div className={styles.stepsPreview} aria-hidden="true"><span>What’s your kind of date?</span><span>Romantic</span><span>Something playful</span></div>}
        <h2>{mode.title}</h2><p>{mode.description}</p>
        <button className={styles.modeAction} type="button" onClick={() => onChoose(mode.value)}>{mode.action}<ArrowUpRight size={22} aria-hidden="true" /></button>
      </section>)}
    </div>
  </main>;
}
