"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { draftResumePath } from "@/lib/planner/draft-retention";
import { plannerDraftVersion } from "@/lib/planner/questions";
import { LoverIntro } from "./lover-intro";
import { PlanningIntro } from "./planning-intro";

export function Homepage({ onPlan }: { onPlan: () => void }) {
  const [showIntroduction, setShowIntroduction] = useState(false);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      try { if (active) setResumePath(draftResumePath(sessionStorage.getItem(`date-atlas:planning-draft:v${plannerDraftVersion}`))); } catch { /* Planning works without browser storage. */ }
    });
    return () => { active = false; };
  }, []);

  if (showIntroduction) return <PlanningIntro onStart={onPlan} />;
  return <LoverIntro onContinue={() => setShowIntroduction(true)} onResume={resumePath ? () => router.push(resumePath) : undefined} />;
}
