import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
import { SavedDatesGate } from "@/components/date-atlas/saved-dates-access";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = privateMetadata("My dates");
export default function Page() {
  return (
    <Suspense
      fallback={<main className="loading-state">A little moment…</main>}
    >
      <SavedDatesGate><DateAtlas initialView="saved" /></SavedDatesGate>
    </Suspense>
  );
}
