"use client";

import { useSearchParams } from "next/navigation";
import { DateAtlas } from "./date-atlas";
import { MembershipPlannerGate } from "./membership-planner-gate";

export function PlannerEntry() {
  const searchParams = useSearchParams();
  return (
    <MembershipPlannerGate flow={searchParams.get("flow") ?? "direct"}><DateAtlas
      initialView="planner"
      key={searchParams.get("flow") ?? "direct"}
    /></MembershipPlannerGate>
  );
}
