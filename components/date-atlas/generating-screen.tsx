"use client";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import type { CompanionTheme } from "@/lib/animations/registry";
export function GeneratingScreen({ stage = "Planning your date", theme = "white" }: { stage?: string; theme?: CompanionTheme }) {
  return <main className="planning-loader" aria-busy="true">
    <AtlasCompanion pose="concierge" theme={theme} label="Atlas is thoughtfully preparing your date" width={290} height={260} lively />
    <span className="eyebrow">A LITTLE THOUGHT IN EVERY DETAIL</span>
    <h1>Something lovely<br />is coming together.</h1>
    <p role="status">{stage}</p>
    <small>Checking catalog constraints and preparing your recommendations. No reservations are made.</small>
  </main>;
}
