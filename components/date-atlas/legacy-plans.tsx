"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseSaved, toRecipe, type SavedRecipe } from "@/lib/planner/saved";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { recommendationResultSchema } from "@/lib/planner/response-schema";
import { getBrowserAuth } from "@/lib/firebase/client";
const legacyKey = "date-atlas:saved:v1";

export function LegacyPlans({ onImported }: { onImported: (recipe: SavedRecipe) => void }) {
  const [plans, setPlans] = useState<SavedRecipe[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function review() {
    try { setPlans(parseSaved(localStorage.getItem(legacyKey))); setMessage(""); }
    catch { setMessage("Device storage isn't available in this browser."); }
  }
  async function importPlan(recipe: SavedRecipe) {
    if (active.current) return;
    const uid = getBrowserAuth()?.currentUser?.uid;
    if (!uid || getBrowserAuth()?.currentUser?.isAnonymous) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setMessage("");
    try {
      const result = recommendationResultSchema.parse(await readPlanningResponse(await plannerFetch("/api/plans/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recipe), signal: controller.signal }), () => {}));
      const plan = result.plans[0];
      if (!plan) throw new Error("This older plan needs new preferences before it can be saved.");
      if (getBrowserAuth()?.currentUser?.uid !== uid) return;
      const current = toRecipe(plan);
      await readPlanningResponse(await plannerFetch("/api/saved-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current), signal: controller.signal }), () => {});
      if (controller.signal.aborted || getBrowserAuth()?.currentUser?.uid !== uid) return;
      onImported(current);
      const remaining = parseSaved(localStorage.getItem(legacyKey)).filter((item) => item.id !== recipe.id);
      localStorage.setItem(legacyKey, JSON.stringify(remaining)); setPlans(remaining); setMessage("Imported and recalculated with current catalog details.");
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Import failed. The older copy has been kept."); }
    finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
  }
  return <details className="data-notice"><summary>Recover older plans saved on this device</summary><p>These older plans have no account owner. On a shared device, review them and import only your own plans into the account you are signed into.</p><Button variant="outline" disabled={busy} onClick={review}>Review older device plans</Button>{plans?.length === 0 && <p>No older device plans found.</p>}{plans?.map((plan) => <div key={plan.id}><p>{plan.title} · {plan.request.city} · {plan.request.date}</p><Button disabled={busy} onClick={() => void importPlan(plan)}>Import this plan to my account</Button></div>)}{message && <p role="status">{message}</p>}</details>;
}
