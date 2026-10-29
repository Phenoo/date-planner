"use client";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { animations, type AnimationName } from "@/lib/animations/registry";

const Player = dynamic(async () => {
  const lottieModule = await import("@lottiefiles/dotlottie-react");
  lottieModule.setWasmUrl("/animations/player.wasm");
  return lottieModule.DotLottieReact;
}, { ssr: false });
function subscribeMotion(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify); return () => query.removeEventListener("change", notify);
}
function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify);
}
export function LottieAnimation({ animation, src, fallback, label, width = 280, height = 200,
  autoplay = true, loop = false, speed = 1, playing = true, onComplete, className = "",
}: { animation?: AnimationName; src?: string; fallback?: string; label: string; width?: number | string;
  height?: number | string; autoplay?: boolean; loop?: boolean; speed?: number; playing?: boolean;
  onComplete?: () => void; className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const [visible, setVisible] = useState(false);
  const [activated, setActivated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [player, setPlayer] = useState<DotLottie | null>(null);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const pageVisible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const complete = useEffectEvent(() => onComplete?.());
  const asset = animation ? animations[animation] : undefined;
  const source = src ?? asset?.src;
  const still = fallback ?? asset?.fallback;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => { setVisible(entry.isIntersecting); if (entry.isIntersecting) setActivated(true); }, { rootMargin: "80px" });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!player) return;
    finished.current = false;
    const load = () => setLoaded(true);
    const error = () => setFailed(true);
    const done = () => { finished.current = true; complete(); };
    player.addEventListener("load", load); player.addEventListener("loadError", error);
    player.addEventListener("renderError", error); player.addEventListener("complete", done);
    if (player.isLoaded) load();
    return () => {
      player.removeEventListener("load", load); player.removeEventListener("loadError", error);
      player.removeEventListener("renderError", error); player.removeEventListener("complete", done);
    };
  }, [player]);
  useEffect(() => {
    if (!player || !loaded) return;
    if (visible && pageVisible && playing && autoplay && !reduced && (loop || !finished.current)) player.play();
    else player.pause();
  }, [player, loaded, visible, pageVisible, playing, autoplay, reduced, loop]);
  const style: CSSProperties = { width, height, maxWidth: "100%" };
  return <div ref={container} className={`lottie-illustration ${className}`} style={style} role="img" aria-label={label} data-animation-state={failed ? "fallback" : loaded ? "ready" : "static"}>
    {still && (!loaded || failed || reduced) && <Image src={still} alt="" aria-hidden="true" fill sizes="320px" unoptimized />}
    {!reduced && activated && !failed && source && <Player src={source} autoplay={false} loop={loop} speed={speed}
      dotLottieRefCallback={setPlayer} aria-hidden="true" renderConfig={{ devicePixelRatio: 2, freezeOnOffscreen: true }}
      style={{ opacity: loaded ? 1 : 0 }} />}
  </div>;
}
