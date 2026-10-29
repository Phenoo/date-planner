import { Suspense } from "react";
import { DateAtlas } from "@/components/date-atlas/date-atlas";
export default function Page() {
  return (
    <Suspense
      fallback={<main className="loading-state">A little moment…</main>}
    >
      <DateAtlas initialView="profile" />
    </Suspense>
  );
}
