import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { WebVitals } from "@/components/analytics/web-vitals";
import { PageSurface } from "@/components/date-atlas/page-surface";
import { analyticsMeasurementId } from "@/lib/analytics/policy";
import { pageSurfaceBootstrap } from "@/lib/planner/page-surface";
import { siteDescription, siteName, siteOrigin } from "@/lib/seo/site";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: siteName,
  title: { default: `Date Ideas & AI Date Planner | ${siteName}`, template: `%s | ${siteName}` },
  description: siteDescription,
  category: "lifestyle",
  robots: { index: process.env.VERCEL_ENV !== "preview" && process.env.VERCEL_ENV !== "development", follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const measurementId = process.env.VERCEL_ENV === "production" ? analyticsMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) : null;
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: pageSurfaceBootstrap }} /></head>
      <body><Suspense fallback={null}><PageSurface /></Suspense>{children}{measurementId && <Suspense fallback={null}><GoogleAnalytics measurementId={measurementId} /><WebVitals /></Suspense>}</body>
    </html>
  );
}
