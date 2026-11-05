"use client";

import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { DateAtlas } from "./date-atlas";
import { Preloader } from "./preloader";
import { PlannerLoadingScreen } from "./planner-loading-screen";
import { observeSavedDatesAccess } from "./saved-dates-access";

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
  return <PlannerLoadingScreen context="home" />;
}

export function HomeEntry() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const query = params.toString();
  useLayoutEffect(() => observeSavedDatesAccess(state => setSignedIn(state === "signed-in")), [query]);
  useLayoutEffect(() => () => {
    // Activity preserves hidden pages; recheck authentication before showing their account UI.
    setSignedIn(false);
  }, []);
  const completedIntro = useSyncExternalStore(subscribeIntro, hasCompletedIntro, serverIntroSnapshot);
  const continueToHome = useCallback(() => {
    try { localStorage.setItem(introKey, "complete"); }
    catch { /* The visit can continue when browser storage is unavailable. */ }
    setReady(true);
  }, []);
  const returning = params.has("plan") || params.has("auth") || params.has("oobCode");

  if (signedIn || ready || returning || completedIntro) return <DateAtlas />;
  if (completedIntro === null) return <HomeEntryFallback />;
  return <Preloader onContinue={continueToHome} />;
}
