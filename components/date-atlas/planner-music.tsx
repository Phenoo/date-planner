"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Music2, Play, VolumeX, X } from "lucide-react";
import { LottieAnimation } from "@/components/animations/lottie-animation";
import { humanAtlasAsset, type CompanionTheme } from "@/lib/animations/registry";
import styles from "./planner-appearance.module.css";

const musicHintKey = "date-atlas:music-hint-seen:v1";
let musicHintSeen = false;

const tracks = [
  { title: "Soft Keys", genre: "Mellow piano", src: "/audio/planner-instrumental.mp3" },
  { title: "Late Night", genre: "Lo-fi beats", src: "/audio/planner-late-night.mp3" },
  { title: "Golden Hour", genre: "Acoustic strings", src: "/audio/planner-golden-hour.mp3" },
  { title: "Slow Sunday", genre: "Smooth jazz", src: "/audio/planner-slow-sunday.mp3" },
  {
    title: "Coastal Afrobeats Breeze", genre: "Afrobeats",
    src: "/audio/planner-coastal-afrobeats.mp3",
    credit: "https://budgetpixel.com/background-music/coastal-afrobeats-breeze-ab7d9de2",
  },
  {
    title: "Wistful Space Pluck", genre: "Melodic trap",
    src: "/audio/planner-wistful-space-pluck.mp3",
    credit: "https://budgetpixel.com/background-music/wistful-space-pluck-070a4af5",
  },
];

export function PlannerMusic({ theme }: { theme: CompanionTheme }) {
  const character = humanAtlasAsset("discover", theme);
  const pickerId = useId();
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const playAttempt = useRef(0);
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { musicHintSeen ||= sessionStorage.getItem(musicHintKey) === "1"; }
      catch { /* The prompt can still be dismissed for this page. */ }
      setShowHint(!musicHintSeen);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    const pause = () => {
      playAttempt.current++;
      player.pause();
    };
    window.addEventListener("pagehide", pause);
    return () => {
      window.removeEventListener("pagehide", pause);
      pause();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  function dismissHint() {
    if (!showHint) return;
    musicHintSeen = true;
    setShowHint(false);
    try { sessionStorage.setItem(musicHintKey, "1"); }
    catch { /* The page still remembers the dismissal in memory. */ }
  }

  function openFromHint(openPicker: boolean) {
    trigger.current?.focus();
    dismissHint();
    setOpen(openPicker);
  }

  async function selectTrack(src: string | null) {
    const player = audio.current;
    if (!player || (src !== null && src === activeTrack)) return;
    const attempt = ++playAttempt.current;
    setFailed(false);
    setActiveTrack(src);
    if (!src) {
      player.pause();
      return;
    }

    if (player.getAttribute("src") !== src) player.src = src;
    else if (player.error) player.load();
    try {
      await player.play();
    } catch {
      if (audio.current === player && playAttempt.current === attempt) {
        setActiveTrack(null);
        setFailed(true);
      }
    }
  }

  return (
    <div
      ref={picker}
      className={styles.music}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if ((!open && !showHint) || event.key !== "Escape") return;
        event.stopPropagation();
        openFromHint(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.musicToggle}
        aria-label="Background music"
        aria-expanded={open}
        aria-controls={pickerId}
        data-playing={activeTrack !== null}
        title="Background music"
        onClick={() => {
          dismissHint();
          setOpen((previous) => !previous);
        }}
      >
        <Music2 size={16} aria-hidden="true" />
        <span>Music</span>
      </button>
      {showHint && !open && <div className={styles.musicHint}>
        <div className={styles.musicHintArt} aria-hidden="true">
          <LottieAnimation key={theme} src={character.src} fallback={character.fallback} label="Waving planner character" width={72} height={72} />
        </div>
        <button type="button" className={styles.musicHintAction} aria-expanded={false} aria-controls={pickerId} onClick={() => openFromHint(true)}>
          <span>Do you want music?</span>
        </button>
        <button type="button" className={styles.musicHintDismiss} aria-label="Dismiss music suggestion" onClick={() => openFromHint(false)}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>}
      <div id={pickerId} className={styles.musicPicker} hidden={!open} role="group" aria-label="Choose background music">
        <strong>Background music</strong>
        <ul className={styles.musicTracks}>
          <li>
            <button type="button" aria-pressed={!activeTrack} onClick={() => void selectTrack(null)}>
              {!activeTrack ? <Check size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
              Off
            </button>
          </li>
          {tracks.map((track) => (
            <li key={track.src}>
              <button type="button" aria-pressed={activeTrack === track.src} onClick={() => void selectTrack(track.src)}>
                {activeTrack === track.src ? <Check size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                <span>{track.title}<small>{track.genre}</small></span>
              </button>
            </li>
          ))}
        </ul>
        <details className={styles.musicCredits}>
          <summary>Track credits</summary>
          <ul>
            {tracks.map((track) => track.credit && <li key={track.src}><a href={track.credit} target="_blank" rel="noreferrer">{track.title}</a></li>)}
          </ul>
          <small>By BudgetPixel AI · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · Level and fades adjusted</small>
        </details>
        <span role="status" className={failed ? styles.musicStatus : "sr-only"}>
          {failed ? "Music couldn’t play. Choose a track to try again." : ""}
        </span>
      </div>
      <audio
        ref={audio}
        preload="none"
        loop
        onPause={(event) => { if (event.currentTarget.paused) setActiveTrack(null); }}
        onError={(event) => {
          if (activeTrack && event.currentTarget.error) {
            setActiveTrack(null);
            setFailed(true);
          }
        }}
      />
    </div>
  );
}
