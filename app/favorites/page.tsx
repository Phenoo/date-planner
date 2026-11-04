import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = privateMetadata("Your saved inspiration");
export default function Page() {
  return (
    <Suspense
      fallback={<main className="loading-state">A little moment…</main>}
    >
      <DateAtlas initialView="favorites" />
    </Suspense>
  );
}
