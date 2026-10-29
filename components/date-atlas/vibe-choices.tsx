"use client";

import Image from "next/image";
import { vibes, type PlanRequest } from "@/lib/planner/schema";
import styles from "./vibe-choices.module.css";

type Vibe = PlanRequest["vibes"][number];
const illustrations = {
  Romantic: "romantic",
  Adventurous: "adventurous",
  Relaxed: "relaxed",
  Playful: "playful",
  Luxurious: "luxurious",
  Creative: "creative",
  "Food & dining": "food-and-dining",
  Outdoors: "outdoors",
  Entertainment: "entertainment",
  Private: "private",
  Active: "active",
  Unexpected: "unexpected",
} satisfies Record<Vibe, string>;

export function VibeChoices({ selected, onToggle, disabled = false }: { selected: readonly Vibe[]; onToggle: (vibe: Vibe) => void; disabled?: boolean }) {
  return <div className={styles.grid} role="group" aria-label="Date vibes">
    {vibes.map((vibe) => {
      const chosen = selected.includes(vibe);
      return <button type="button" key={vibe} className={`${styles.card} ${chosen ? styles.selected : ""}`} aria-pressed={chosen} disabled={disabled} onClick={() => onToggle(vibe)}>
        <span className={styles.art} aria-hidden="true">
          <Image src={`/illustrations/vibes/editorial-v2/${illustrations[vibe]}.webp`} alt="" width={720} height={480} sizes="(max-width:700px) 44vw, 240px" draggable={false} />
        </span>
        <span className={styles.label}>{vibe}<span className={styles.selection} aria-hidden="true">{chosen ? "✓" : ""}</span></span>
      </button>;
    })}
  </div>;
}
