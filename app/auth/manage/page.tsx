import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountEmailAction } from "@/components/date-atlas/account-email-action";
import { privateMetadata } from "@/lib/seo/site";

export const metadata: Metadata = { ...privateMetadata("Account security"), referrer: "no-referrer" };

export default function AccountEmailActionPage() {
  return <Suspense fallback={<main className="loading-state" role="status">Opening your secure link…</main>}>
    <AccountEmailAction />
  </Suspense>;
}
