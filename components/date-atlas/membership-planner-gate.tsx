"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { onIdTokenChanged } from "firebase/auth";
import { getBrowserAuth, waitForAccountTransition } from "@/lib/firebase/client";
import { plannerFetch, planningToken } from "@/lib/firebase/planner-client";
import { membershipSummarySchema } from "@/lib/membership/schema";
import { hasRetainedGenerationAttempt, replacementReferenceKey, replacementReferenceSchema } from "@/lib/membership/generation-attempt";
import { readPlanningContinuation } from "@/lib/planner/planning-continuation";
import { Button } from "@/components/ui/button";
import { PlannerLoadingScreen } from "./planner-loading-screen";
import appearance from "./planner-appearance.module.css";

export function MembershipPlannerGate({ flow, children }: { flow: string; children: ReactNode }) {
  const enabled = process.env.NEXT_PUBLIC_DATE_ATLAS_MEMBERSHIP_TEST === "1";
  const [state, setState] = useState({ flow, checking: enabled, blocked: false, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let request: AbortController | null = null;
    let identity = "";
    const setup = new AbortController();
    const check = async () => {
      request?.abort();
      const controller = new AbortController(); request = controller;
      const user = getBrowserAuth()?.currentUser;
      const uid = user?.uid;
      const current = () => active && !controller.signal.aborted && getBrowserAuth()?.currentUser?.uid === uid;
      setState((previous) => previous.flow === flow && !previous.checking && !previous.blocked && !previous.error ? previous : { flow, checking: true, blocked: false, error: "" });
      try {
        await waitForAccountTransition();
        if (!current()) return;
        let replacement = false;
        try {
          const continuation = readPlanningContinuation(sessionStorage, { id: uid ?? null, anonymous: user?.isAnonymous ?? true }, flow);
          if ((continuation && continuation.source !== "draft") || (uid && hasRetainedGenerationAttempt(sessionStorage, uid, flow))) {
            if (current()) setState({ flow, checking: false, blocked: false, error: "" });
            return;
          }
          const ref = replacementReferenceSchema.safeParse(JSON.parse(sessionStorage.getItem(replacementReferenceKey(flow)) ?? "null"));
          replacement = ref.success && ref.data.owner === uid && ref.data.expiresAt > Date.now();
        } catch { /* A blocked browser store doesn't prevent a new allowance check. */ }
        const response = await plannerFetch("/api/membership", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Your planning allowance couldn't be checked. Please try again.");
        const summary = membershipSummarySchema.parse(await response.json());
        if (current()) setState({ flow, checking: false, blocked: (replacement ? summary.changes : summary.plans).remaining === 0, error: "" });
      } catch {
        if (current()) setState({ flow, checking: false, blocked: false, error: "Your planning allowance couldn't be checked. Please try again." });
      }
    };
    const auth = getBrowserAuth();
    const unsubscribe = auth ? onIdTokenChanged(auth, (user) => {
      const next = user?.uid ?? "signed-out";
      if (identity === next) return;
      identity = next;
      request?.abort();
      if (user) void check();
      else {
        setState({ flow, checking: true, blocked: false, error: "" });
        void planningToken(setup.signal).catch(() => { if (active && !setup.signal.aborted) setState({ flow, checking: false, blocked: false, error: "Your planning session couldn't connect. Please try again." }); });
      }
    }) : null;
    void planningToken(setup.signal).then(() => {
      if (active && !setup.signal.aborted && !auth) setState({ flow, checking: false, blocked: false, error: "Your planning session couldn't connect. Please try again." });
    }).catch(() => { if (active && !setup.signal.aborted) setState({ flow, checking: false, blocked: false, error: "Your planning session couldn't connect. Please try again." }); });
    return () => { active = false; setup.abort(); request?.abort(); unsubscribe?.(); };
  }, [enabled, flow, revision]);
  if (!enabled) return children;
  if (state.flow !== flow || state.checking) return <PlannerLoadingScreen stage="Checking your planning allowance…" />;
  if (state.error || state.blocked) return <main className={`${appearance.palette} ${appearance.initialPalette} ${appearance.planner} content-width empty-state`}><h1>{state.blocked ? "Your next date can wait a little." : "Let’s get you connected."}</h1><p>{state.error || "You've used this month’s allowance. Check when it resets or explore Plus. Your saved dates and invitations are still here."}</p>{state.error ? <Button onClick={() => setRevision((value) => value + 1)}>Try again</Button> : <Button asChild><Link href="/membership">See your membership</Link></Button>}<p><Link href="/saved">Your saved dates</Link></p></main>;
  return children;
}
