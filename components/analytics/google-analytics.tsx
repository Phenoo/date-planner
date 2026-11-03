"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { analyticsPage, type AnalyticsChoice } from "@/lib/analytics/policy";
import { getAnalyticsChoice, googleTagBootstrap, openAnalyticsChoices, setAnalyticsChoice, stopAnalytics, subscribeAnalyticsChoice, syncAnalytics } from "@/lib/analytics/client";
import styles from "./google-analytics.module.css";

const pendingChoice = () => "pending" as const;

export function AnalyticsChoicesButton() {
  return <button type="button" className={styles.settings} onClick={() => window.dispatchEvent(new Event(openAnalyticsChoices))}>Change analytics choice</button>;
}

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const choice = useSyncExternalStore<AnalyticsChoice | "pending" | null>(subscribeAnalyticsChoice, getAnalyticsChoice, pendingChoice);
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const accepted = choice === "accepted";

  useEffect(() => { syncAnalytics(measurementId, accepted, pathname); }, [measurementId, accepted, pathname]);
  useEffect(() => {
    const show = () => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true); };
    window.addEventListener(openAnalyticsChoices, show);
    return () => { window.removeEventListener(openAnalyticsChoices, show); stopAnalytics(); };
  }, []);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);

  function choose(value: "accepted" | "declined") {
    setAnalyticsChoice(value); setOpen(false);
    returnFocus.current?.focus(); returnFocus.current = null;
  }

  return <>
    {accepted && analyticsPage(pathname) && <>
      <Script id="adal-google-analytics-bootstrap" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: googleTagBootstrap }} />
      <Script id="adal-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" referrerPolicy="origin" onReady={() => syncAnalytics(measurementId, getAnalyticsChoice() === "accepted", window.location.pathname)} />
    </>}
    {choice !== "pending" && (choice === null || open) && <section className={styles.notice} aria-label="Analytics choice">
      <div><h2 ref={heading} tabIndex={-1}>Help us make adal better?</h2><p>Optional Google Analytics cookies help us understand visits and planning actions. Your chat messages and personal planning answers stay out of Analytics. <a href="/privacy">Privacy details</a></p></div>
      <div className={styles.actions}><button type="button" onClick={() => choose("declined")}>No thanks</button><button type="button" onClick={() => choose("accepted")}>Allow analytics</button></div>
    </section>}
  </>;
}
