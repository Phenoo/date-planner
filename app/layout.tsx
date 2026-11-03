import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { analyticsMeasurementId } from "@/lib/analytics/policy";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
export const metadata: Metadata = {
  applicationName: "a date at las",
  title: "a date at las — Your perfect date, thoughtfully planned",
  description:
    "Less planning. More unforgettable moments. Discover your next date in Lagos and create a personal itinerary around your vibe, time, and budget.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const measurementId = process.env.VERCEL_ENV === "production" ? analyticsMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) : null;
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} h-full antialiased`}
    >
      <body>{children}{measurementId && <Suspense fallback={null}><GoogleAnalytics measurementId={measurementId} /></Suspense>}</body>
    </html>
  );
}
