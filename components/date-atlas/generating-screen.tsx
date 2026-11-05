"use client";
import { coverScreenSiblings } from "@/lib/planner/focus-screen";
import { lockBodyScroll } from "@/lib/planner/body-scroll-lock";
import { useEffect, useRef } from "react";
import type { CompanionTheme } from "@/lib/animations/registry";
import { planningStageCopy } from "@/lib/planner/progress-copy";
import { PlannerLoadingScreen } from "./planner-loading-screen";
export function GeneratingScreen({ stage = "Planning your date", theme = "red", mode = "generating" }: { stage?: string; theme?: CompanionTheme; mode?: "opening" | "generating"; onCancel?: () => void }) {
  const screen = useRef<HTMLElement>(null);
  useEffect(() => { const uncover = coverScreenSiblings(screen.current); screen.current?.querySelector("h1")?.focus({ preventScroll: true }); const unlockScroll = lockBodyScroll(document.body); return () => { unlockScroll(); uncover(); }; }, []);
  return <PlannerLoadingScreen screenRef={screen} theme={theme} mode={mode} stage={planningStageCopy(stage)} overlay />;
}
