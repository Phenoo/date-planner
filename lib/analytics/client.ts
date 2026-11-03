"use client";

import { analyticsChoiceKey, analyticsPage, createAnalyticsSession, readAnalyticsChoice, type AnalyticsChoice, type AnalyticsEvent, type GoogleTag } from "./policy";

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: GoogleTag; }
}

const choiceChanged = "date-atlas:analytics-choice-changed";
export const openAnalyticsChoices = "date-atlas:open-analytics-choices";
let memoryChoice: AnalyticsChoice | null = null;
let active: { id: string; session: ReturnType<typeof createAnalyticsSession> } | null = null;
const pending: AnalyticsEvent[] = [];

export function getAnalyticsChoice() {
  if (memoryChoice) return memoryChoice;
  try { return readAnalyticsChoice(window.localStorage); } catch { return null; }
}

export function stopAnalytics() {
  pending.length = 0;
  active?.session.consent(false);
}

export function setAnalyticsChoice(choice: AnalyticsChoice) {
  memoryChoice = choice;
  if (choice === "declined") {
    stopAnalytics();
    if (active) {
      try {
        for (const name of ["_ga", `_ga_${active.id.slice(2)}`]) {
          for (const domain of ["", `; domain=${window.location.hostname}`]) {
            document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
          }
        }
      } catch { /* Measurement stays disabled when the browser blocks cookie access. */ }
    }
  }
  try { localStorage.setItem(analyticsChoiceKey, choice); } catch { /* The choice still applies in this tab. */ }
  window.dispatchEvent(new Event(choiceChanged));
}

export function subscribeAnalyticsChoice(notify: () => void) {
  const changed = () => { if (getAnalyticsChoice() !== "accepted") stopAnalytics(); notify(); };
  const stored = (event: StorageEvent) => {
    if (event.key !== analyticsChoiceKey && event.key !== null) return;
    memoryChoice = null; changed();
  };
  window.addEventListener(choiceChanged, changed);
  window.addEventListener("storage", stored);
  return () => { window.removeEventListener(choiceChanged, changed); window.removeEventListener("storage", stored); };
}

export function syncAnalytics(id: string, accepted: boolean, pathname: string) {
  if (!accepted) { stopAnalytics(); return; }
  if (active?.id !== id) {
    stopAnalytics();
    const queue = window.dataLayer ?? [];
    window.dataLayer = queue;
    const tag: GoogleTag = window.gtag ?? ((...command) => { queue.push(command); });
    const send: GoogleTag = (...command) => { try { tag(...command); } catch { /* Analytics must not interrupt planning. */ } };
    window.gtag = tag;
    active = { id, session: createAnalyticsSession(id, window.location.origin, send, (disabled) => { Reflect.set(window, `ga-disable-${id}`, disabled); }) };
  }
  active.session.consent(true);
  active.session.pageView(pathname, document.referrer);
  for (const event of pending.splice(0)) active.session.event(event);
}

export function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (typeof window === "undefined" || getAnalyticsChoice() !== "accepted" || !analyticsPage(window.location.pathname)) return;
  if (!active) { if (pending.length < 20) pending.push(event); return; }
  active.session.pageView(window.location.pathname, document.referrer);
  active.session.event(event);
}
