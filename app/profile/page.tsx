import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = privateMetadata("Your profile");
export default function Page() {
  return (
    <Suspense
      fallback={<main className="loading-state">A little moment…</main>}
    >
      <DateAtlas initialView="profile" />
    </Suspense>
  );
}
