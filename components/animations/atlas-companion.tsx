"use client";
import { useState } from "react";
import { LottieAnimation } from "./lottie-animation";
import { humanAtlasAsset, type AnimationName, type CompanionTheme } from "@/lib/animations/registry";
type Props = { pose?: AnimationName; theme?: CompanionTheme; label?: string; width?: number | string; height?: number | string; playing?: boolean; idle?: boolean; lively?: boolean; reactionKey?: string | number; className?: string; eager?: boolean };
function Pose({ pose = "discover", theme = "white", label = "Oge, your date-planning companion", width = 250, height = 230, playing = true, idle = true, lively = false, className = "", eager = false }: Props) {
  const [settled, setSettled] = useState(false);
  const animation = settled && idle && !lively ? "idle" : pose;
  const human = humanAtlasAsset(animation, theme);
  return <LottieAnimation key={`${animation}:${theme}`} animation={animation} src={human.src} fallback={human.fallback} label={label} width={width} height={height} className={className}
    eager={eager} loop={lively || (settled && idle)} playing={playing} onComplete={() => { if (!lively) setSettled(true); }} />;
}
export function AtlasCompanion(props: Props) { return <Pose key={`${props.pose}:${props.theme}:${props.lively ?? false}:${props.reactionKey ?? "initial"}`} {...props} />; }
