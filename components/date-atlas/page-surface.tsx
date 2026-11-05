"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { applyPageSurface, parsePlannerAppearance, readPlannerAppearance } from "@/lib/planner/page-surface";

export function PageSurface() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const synchronize = () => applyPageSurface(document.documentElement, window.location.pathname, readPlannerAppearance());
    const onPageShow = () => {
      const root = document.documentElement;
      const appearance = root.getAttribute("data-planner-appearance");
      applyPageSurface(root, window.location.pathname, appearance === null ? readPlannerAppearance() : parsePlannerAppearance(appearance));
    };
    synchronize();
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [pathname]);
  return null;
}
