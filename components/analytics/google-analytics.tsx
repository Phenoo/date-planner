"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { analyticsPage } from "@/lib/analytics/policy";
import { googleTagBootstrap, stopAnalytics, syncAnalytics } from "@/lib/analytics/client";

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  useEffect(() => { syncAnalytics(measurementId, pathname); }, [measurementId, pathname]);
  useEffect(() => () => stopAnalytics(), []);

  if (!analyticsPage(pathname)) return null;
  return <>
    <Script id="adal-google-analytics-bootstrap" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: googleTagBootstrap }} />
    <Script id="adal-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" referrerPolicy="origin" onReady={() => syncAnalytics(measurementId, window.location.pathname)} />
  </>;
}
