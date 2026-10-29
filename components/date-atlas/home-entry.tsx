"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { DateAtlas } from "./date-atlas";
import { Preloader } from "./preloader";
import styles from "./preloader.module.css";

const introKey = "date-atlas:onboarding:v3";

function subscribeIntro(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === introKey || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function hasCompletedIntro() {
  try { return localStorage.getItem(introKey) === "complete"; }
  catch { return false; }
}

function serverIntroSnapshot() { return null; }

export function HomeEntryFallback() {
  return <main className={styles.preloader} aria-label="Loading a date at las" aria-busy="true">
    <span className={`atlas-wordmark ${styles.brand}`}>a date at las<span>.</span></span>
  </main>;
}

export function HomeEntry() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const completedIntro = useSyncExternalStore(subscribeIntro, hasCompletedIntro, serverIntroSnapshot);
  const continueToHome = useCallback(() => {
    try { localStorage.setItem(introKey, "complete"); }
    catch { /* The visit can continue when browser storage is unavailable. */ }
    setReady(true);
  }, []);
  const returning = params.has("plan") || params.has("auth") || params.has("oobCode");

  if (ready || returning || completedIntro) return <DateAtlas />;
  if (completedIntro === null) return <HomeEntryFallback />;
  return <Preloader onContinue={continueToHome} />;
}
