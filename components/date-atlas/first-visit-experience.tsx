"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AtlasCompanion } from "@/components/animations/atlas-companion";
import type { AnimationName } from "@/lib/animations/registry";
import { Button } from "@/components/ui/button";
const dateStorySteps = [
  { title: "Great dates start here.", description: "Discover beautiful places and exciting experiences you'll both love.", detail: "A little discovery. A lot to look forward to.", animation: "discover", color: "lavender" },
  { title: "Every date should feel like yours.", description: "Tell us your budget, interests, and vibe. We'll handle the planning.", detail: "Built around your time, your tastes, and your comfort zone.", animation: "preferences", color: "coral" },
  { title: "Less planning. More memories.", description: "Get a beautiful, personalized date plan in minutes.", detail: "Thoughtful timing, practical budgets, and room for connection.", animation: "itinerary", color: "sage" },
] as const satisfies readonly { title: string; description: string; detail: string; animation: AnimationName; color: string }[];
import { Preloader } from "./preloader";

const welcomeKey = "date-atlas:onboarding:v3";
type Phase = "preload" | "onboard" | "complete";

function subscribeMotion(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}

export function FirstVisitExperience({
  enabled,
  replayToken,
  onPlan,
  children,
}: {
  enabled: boolean;
  replayToken: number;
  onPlan: () => void;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(enabled ? "preload" : "complete");
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  const tabVisible = useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => true,
  );
  const focusNextStep = useRef(true);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const handledReplay = useRef(0);
  const completedThisVisit = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const replayRequested = replayToken > handledReplay.current;
      handledReplay.current = replayToken;
      let completed = completedThisVisit.current;
      try {
        completed ||= localStorage.getItem(welcomeKey) === "complete";
      } catch {
        /* The introduction also works without browser storage. */
      }
      completedThisVisit.current = completed;
      const sharedPlan = new URLSearchParams(window.location.search).has(
        "plan",
      );
      const signInReturn =
        new URLSearchParams(window.location.search).has("auth") ||
        new URLSearchParams(window.location.search).has("oobCode");
      if (sharedPlan || signInReturn || (completed && !replayRequested)) {
        setPhase("complete");
        return;
      }
      setPhase("preload");
      setStep(0);
      setPaused(false);
      focusNextStep.current = true;
    });
    return () => {
      active = false;
    };
  }, [enabled, replayToken]);
  useEffect(() => {
    if (phase === "onboard" && focusNextStep.current)
      heading.current?.focus({ preventScroll: true });
  }, [phase, step]);
  function selectStep(next: number) {
    focusNextStep.current = true;
    setStep(next);
  }
  function complete(plan = false) {
    completedThisVisit.current = true;
    try {
      localStorage.setItem(welcomeKey, "complete");
    } catch {
      /* The current visit can continue even when storage is blocked. */
    }
    setPhase("complete");
    if (plan) onPlan();
  }
  if (!enabled || phase === "complete") return children;
  if (phase === "preload")
    return <Preloader onContinue={() => setPhase("onboard")} />;
  const current = dateStorySteps[step];
  return (
    <main
      className={`welcome-screen welcome-${current.color}`}

    >
      <header className="welcome-header">
        <span className="atlas-wordmark" aria-label="a date at las">
          adal<span>.</span>
        </span>
        <button onClick={() => complete()}>Skip intro</button>
      </header>
      <section className="welcome-layout" aria-label="Get to know a date at las">
        <div className="welcome-animation" onPointerDown={(event) => { swipeStart.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={(event) => {
            const start = swipeStart.current; swipeStart.current = null;
            if (!start || Math.abs(event.clientY - start.y) > 60) return;
            const delta = event.clientX - start.x;
            if (Math.abs(delta) > 65) selectStep(Math.max(0, Math.min(2, step + (delta < 0 ? 1 : -1))));
          }} onPointerCancel={() => { swipeStart.current = null; }} style={{ touchAction: "pan-y" }}>
          <span className="welcome-art-caption">YOUR PERSONAL DATE CONCIERGE</span>
          <AtlasCompanion key={current.animation} pose={current.animation} label={current.title} width="100%" height={360} playing={!paused && tabVisible} />
          <span className="welcome-art-signature">A little help from Atlas<span>.</span></span>
        </div>
        <div className="welcome-copy">
          <span className="eyebrow">LESS PLANNING. MORE POSSIBILITY.</span>
          <h1 ref={heading} tabIndex={-1}>
            <span key={current.title} className="welcome-text-enter">
              {current.title}
            </span>
          </h1>
          <p>
            <span key={current.description} className="welcome-text-enter">
              {current.description}
            </span>
          </p>
          <p className="welcome-detail">{current.detail}</p>
          <div className="welcome-step-track" aria-label="Introduction steps">
            {dateStorySteps.map((item, index) => (
              <button
                key={item.title}
                onClick={() => selectStep(index)}
                aria-label={`Step ${index + 1}: ${item.title}`}
                aria-current={index === step ? "step" : undefined}
              >
                <span />
                {String(index + 1).padStart(2, "0")}
              </button>
            ))}
          </div>
          {!reducedMotion && <div className="welcome-playback"><button aria-pressed={paused} onClick={() => setPaused((previous) => !previous)}>{paused ? "Play motion" : "Pause motion"}</button></div>}
          <div className="welcome-actions">
            {step > 0 && (
              <Button variant="ghost" onClick={() => selectStep(step - 1)}>
                Back
              </Button>
            )}
            <Button
              onClick={() =>
                step === dateStorySteps.length - 1
                  ? complete(true)
                  : selectStep(step + 1)
              }
            >
              {step === dateStorySteps.length - 1 ? "Let’s Plan Your Date" : "Next"}
              <span aria-hidden="true">→</span>
            </Button>
          </div>
          {step === dateStorySteps.length - 1 ? (
            <button className="welcome-look-around" onClick={() => complete()}>
              Take a look around first
            </button>
          ) : (
            <small>Just your kind of date. No account needed.</small>
          )}
        </div>
      </section>
      <footer className="welcome-footer">
        <span>A little thought in every detail.</span>
        <span>
          {step + 1} / {dateStorySteps.length}
        </span>
      </footer>
    </main>
  );
}
