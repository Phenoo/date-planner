"use client";

import { useSearchParams } from "next/navigation";
import { DateAtlas } from "./date-atlas";

export function PlannerEntry() {
  const searchParams = useSearchParams();
  return (
    <DateAtlas
      initialView="planner"
      key={searchParams.get("flow") ?? "direct"}
    />
  );
}
