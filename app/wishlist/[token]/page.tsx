import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SharedWishlist } from "@/components/date-atlas/shared-wishlist";
import { invitationTokenSchema } from "@/lib/planner/invitations";

async function Wishlist({ params }: { params: Promise<{ token: string }> }) {
  const token = invitationTokenSchema.safeParse((await params).token);
  if (!token.success) notFound();
  return <SharedWishlist key={token.data} token={token.data} />;
}

export { metadata } from "../page";

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<main className="loading-state">Opening your wishlist…</main>}><Wishlist params={params} /></Suspense>;
}
