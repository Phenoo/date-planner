import { Suspense } from "react";
import { PlannerEntry } from "@/components/date-atlas/planner-entry";

export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <main className="planning-loader">
          <p>Getting your questions ready…</p>
        </main>
      }
    >
      <PlannerEntry />
    </Suspense>
  );
}
