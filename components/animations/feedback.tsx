"use client";
import { LottieAnimation } from "./lottie-animation";
import type { AnimationName } from "@/lib/animations/registry";
export function AnimatedFeedback({ state, label }: { state: "thinking" | "success" | "error" | "empty"; label: string }) {
  const animation: AnimationName = state === "thinking" ? "concierge" : state;
  return <LottieAnimation key={state} animation={animation} label={label} loop={state === "thinking"} width={150} height={105} />;
}
