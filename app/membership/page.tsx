import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Membership } from "@/components/date-atlas/membership";
import { privateMetadata } from "@/lib/seo/site";
import { membershipTestEnabled } from "@/lib/server/membership-config";
import currencies from "@/lib/planner/data/currencies.json";

export const metadata = privateMetadata("Your membership");

async function MembershipGate() {
  await connection();
  if (!membershipTestEnabled()) notFound();
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = Object.keys(currencies.regions).map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, "en"));
  return <Membership countries={countries} />;
}

export default function Page() {
  return <Suspense fallback={<main className="loading-state">Opening your membership…</main>}><MembershipGate /></Suspense>;
}
