import { HomeEntry, HomeEntryFallback } from "@/components/date-atlas/home-entry";
import { Suspense } from "react";

export default function Home() {
  return (
    <Suspense fallback={<HomeEntryFallback />}>
      <HomeEntry />
    </Suspense>
  );
}
