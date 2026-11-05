import { Suspense } from "react";
import { PlannerEntry } from "@/components/date-atlas/planner-entry";
import { PlannerLoadingScreen } from "@/components/date-atlas/planner-loading-screen";
import { privateMetadata } from "@/lib/seo/site";

export const metadata = privateMetadata("Plan your date");

export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <PlannerLoadingScreen stage="Getting your questions ready…" />
      }
    >
      <PlannerEntry />
    </Suspense>
  );
}
