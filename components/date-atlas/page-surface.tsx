"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { applyPageSurface, parsePlannerAppearance, readPlannerAppearance } from "@/lib/planner/page-surface";
import { useNativeApp } from "./use-native-app";

export function PageSurface() {
  const pathname = usePathname();
  const nativeApp = useNativeApp();
  useLayoutEffect(() => {
    if (nativeApp) document.documentElement.setAttribute("data-native-app", "true");
    else document.documentElement.removeAttribute("data-native-app");
    const synchronize = () => applyPageSurface(document.documentElement, window.location.pathname, readPlannerAppearance());
    const onPageShow = () => {
      const root = document.documentElement;
      const appearance = root.getAttribute("data-planner-appearance");
      applyPageSurface(root, window.location.pathname, appearance === null ? readPlannerAppearance() : parsePlannerAppearance(appearance));
    };
    synchronize();
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [pathname, nativeApp]);
  return null;
}
