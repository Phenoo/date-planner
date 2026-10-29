"use client";

import { useState } from "react";
import { LoverIntro } from "./lover-intro";
import { PlanningIntro } from "./planning-intro";

export function Homepage({ onPlan }: { onPlan: () => void }) {
  const [showIntroduction, setShowIntroduction] = useState(false);

  if (showIntroduction) return <PlanningIntro onStart={onPlan} />;
  return <LoverIntro onContinue={() => setShowIntroduction(true)} />;
}
