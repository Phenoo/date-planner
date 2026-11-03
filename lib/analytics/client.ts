"use client";

import { analyticsPage, createAnalyticsSession, type AnalyticsEvent, type GoogleTag } from "./policy";

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: GoogleTag; }
}

// Google distinguishes Arguments objects from arrays in its command queue.
export const googleTagBootstrap = "window.dataLayer = window.dataLayer || []; window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};";
let active: { id: string; session: ReturnType<typeof createAnalyticsSession> } | null = null;
const pending: AnalyticsEvent[] = [];

export function stopAnalytics() {
  pending.length = 0;
  active?.session.consent(false);
}

export function syncAnalytics(id: string, pathname: string) {
  if (active?.id !== id) {
    const tag = window.gtag;
    if (!tag) return;
    active?.session.consent(false);
    const send: GoogleTag = (...command) => { try { tag(...command); } catch { /* Analytics must not interrupt planning. */ } };
    active = { id, session: createAnalyticsSession(id, window.location.origin, send, (disabled) => { Reflect.set(window, `ga-disable-${id}`, disabled); }) };
  }
  active.session.consent(true);
  active.session.pageView(pathname, document.referrer);
  for (const event of pending.splice(0)) active.session.event(event);
}

export function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (typeof window === "undefined" || !analyticsPage(window.location.pathname)) return;
  if (!active) { if (pending.length < 20) pending.push(event); return; }
  active.session.pageView(window.location.pathname, document.referrer);
  active.session.event(event);
}
