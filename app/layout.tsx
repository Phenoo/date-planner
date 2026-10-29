import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
export const metadata: Metadata = {
  applicationName: "a date at las",
  title: "a date at las — Your perfect date, thoughtfully planned",
  description:
    "Less planning. More unforgettable moments. Discover your next date in Lagos and create a personal itinerary around your vibe, time, and budget.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} h-full antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
