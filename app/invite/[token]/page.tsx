import { Suspense } from "react";
import type { Metadata } from "next";
import { InvitationPage } from "@/components/date-atlas/invitation-page";

export const metadata: Metadata = { title: "A date, just us two. | a date at las", description: "A little thought, a lovely place, and an invitation just for you.", robots: { index: false, follow: false }, referrer: "no-referrer" };
async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationPage key={token} token={token} />;
}
export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<main className="loading-state">Opening your invitation…</main>}><Invitation params={params} /></Suspense>;
}
