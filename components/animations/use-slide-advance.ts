"use client";
import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

function subscribeMotion(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}
export function useSlideAdvance(index: number, interval: number, paused: boolean, onAdvance: () => void) {
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const advance = useEffectEvent(onAdvance);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = window.setTimeout(() => advance(), interval);
    return () => window.clearTimeout(timer);
  }, [index, interval, paused, reduced, visible]);
  return { reduced, visible };
}
