"use client";

import { useLayoutEffect, useState } from "react";
import { LoverIntro } from "./lover-intro";
import { PlanningIntro } from "./planning-intro";

export function Homepage({ onPlan, onResume }: { onPlan: () => void; onResume?: () => void }) {
  const [showIntroduction, setShowIntroduction] = useState(false);
  useLayoutEffect(() => () => {
    // Returning from an Activity-cached planner must expose the saved Continue action.
    setShowIntroduction(false);
  }, []);

  if (showIntroduction) return <PlanningIntro onStart={onPlan} />;
  return <LoverIntro onContinue={() => setShowIntroduction(true)} onResume={onResume} />;
}
