"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeToContinue } from "./swipe-to-continue";
import styles from "./preloader.module.css";

const heartStart = 300;
const heartFinish = 3800;
const writingStart = 4300;
const writingDuration = 3200;
const penLiftDuration = 100;
const handExitDuration = 500;
const nameOrigin = { x: 35, y: 309 };
const nameScale = 410 / 550;
const heartPath = "M240 130 C202 66 125 82 120 141 C115 199 188 238 240 288 C292 238 365 199 360 141 C355 82 278 66 240 130";
const nameStrokes = [
  "M11 77 35 18 59 77M20 56h30",
  "M130 50C121 32 89 36 89 58C89 83 130 84 130 58V18",
  "M184 49C173 33 146 38 146 59C146 82 184 83 184 58V40V77",
  "M208 24V64Q208 81 223 75M196 43h28",
  "M239 57h36C276 32 235 33 237 59C239 81 262 83 276 73",
  "M347 49C336 33 309 38 309 59C309 82 347 83 347 58V40V77",
  "M371 24V64Q371 81 386 75M359 43h28",
  "M421 18V64Q421 79 432 76",
  "M484 49C473 33 446 38 446 59C446 82 484 83 484 58V40V77",
  "M535 44C526 35 504 37 504 49C504 63 537 55 537 68C537 83 512 82 503 74",
  "M81 96C196 88 350 87 489 94",
].flatMap((path, index, paths) => (path.match(/M[^M]+/g) ?? []).map((stroke) => ({ path: stroke, underline: index === paths.length - 1 })));
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function Preloader({ onContinue }: { onContinue?: () => void }) {
  const [drawingComplete, setDrawingComplete] = useState(false);
  const stroke = useRef<SVGPathElement>(null);
  const wash = useRef<SVGPathElement>(null);
  const hand = useRef<SVGGElement>(null);
  const lettering = useRef<SVGGElement>(null);
  const continued = useRef(false);

  function complete() {
    if (!continued.current && onContinue) {
      continued.current = true;
      onContinue();
    }
  }

  useEffect(() => {
    const trace = stroke.current;
    const fill = wash.current;
    const pen = hand.current;
    const letters = lettering.current?.querySelectorAll("path");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    function showFinished() {
      if (trace) trace.style.strokeDashoffset = "0";
      if (fill) fill.style.opacity = "1";
      if (pen) pen.style.opacity = "0";
      letters?.forEach((letter) => { letter.style.strokeDashoffset = "0"; });
      setDrawingComplete(true);
    }
    function motionChanged() {
      if (!media.matches) return;
      window.cancelAnimationFrame(frame);
      showFinished();
    }
    media.addEventListener("change", motionChanged);

    if (media.matches) frame = window.requestAnimationFrame(showFinished);
    else if (trace && fill && pen && letters?.length) {
      try {
        const length = trace.getTotalLength();
        const measuredLetters = Array.from(letters, (element) => ({ element, length: element.getTotalLength() }));
        const totalInk = measuredLetters.reduce((sum, letter) => sum + letter.length, 0);
        let nextStroke = writingStart;
        const strokes = measuredLetters.map((letter) => {
          const start = nextStroke;
          const end = start + writingDuration * letter.length / totalInk;
          nextStroke = end + penLiftDuration;
          return { ...letter, start, end, from: letter.element.getPointAtLength(0), to: letter.element.getPointAtLength(letter.length) };
        });
        const firstStroke = strokes[0];
        const lastStroke = strokes[strokes.length - 1];
        const duration = lastStroke.end + handExitDuration + 200;
        const heartEnd = trace.getPointAtLength(length);
        const namePoint = (point: { x: number; y: number }) => ({ x: nameOrigin.x + point.x * nameScale, y: nameOrigin.y + point.y * nameScale });
        const movePen = (point: { x: number; y: number }, scale = .62, rotation = -15) => {
          pen.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${rotation}) scale(${scale})`);
        };
        const travel = (from: { x: number; y: number }, to: { x: number; y: number }, progress: number) => {
          const eased = progress * progress * (3 - 2 * progress);
          return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased - Math.sin(Math.PI * progress) * 12 };
        };
        const started = performance.now();
        const paint = (now: number) => {
          const elapsed = now - started;
          const progress = clamp((elapsed - heartStart) / (heartFinish - heartStart));
          trace.style.strokeDashoffset = String(1 - progress);
          fill.style.opacity = String(clamp((elapsed - heartFinish) / 650));
          pen.style.opacity = String(clamp(elapsed / 200));
          strokes.forEach((letter) => {
            letter.element.style.strokeDashoffset = String(1 - clamp((elapsed - letter.start) / (letter.end - letter.start)));
          });
          if (elapsed < heartFinish) {
            movePen(trace.getPointAtLength(length * progress), 1, 0);
          } else if (elapsed < writingStart) {
            const moving = clamp((elapsed - heartFinish) / (writingStart - heartFinish));
            movePen(travel(heartEnd, namePoint(firstStroke.from), moving), 1 - .38 * moving, -15 * moving);
          } else {
            const activeIndex = strokes.findIndex((letter) => elapsed < letter.end);
            if (activeIndex >= 0) {
              const active = strokes[activeIndex];
              if (elapsed < active.start && activeIndex > 0) {
                const previous = strokes[activeIndex - 1];
                movePen(travel(namePoint(previous.to), namePoint(active.from), clamp((elapsed - previous.end) / penLiftDuration)));
              } else {
                movePen(namePoint(active.element.getPointAtLength(active.length * clamp((elapsed - active.start) / (active.end - active.start)))));
              }
            } else {
              const lift = clamp((elapsed - lastStroke.end) / handExitDuration);
              const point = namePoint(lastStroke.to);
              movePen({ x: point.x + lift * 14, y: point.y - lift * 25 });
              pen.style.opacity = String(1 - lift);
            }
          }
          if (elapsed < duration) frame = window.requestAnimationFrame(paint);
          else showFinished();
        };
        paint(started);
      } catch {
        frame = window.requestAnimationFrame(showFinished);
      }
    } else frame = window.requestAnimationFrame(showFinished);

    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", motionChanged);
    };
  }, []);

  return (
    <main className={styles.preloader} aria-label="Welcome to a date at las">
      <span className={`atlas-wordmark ${styles.brand}`}>a date at las<span>.</span></span>
      <div className={styles.content}>
        <div className={styles.paper}>
          <svg className={styles.drawing} viewBox="0 30 480 370" role="img" aria-label="A hand draws a heart, then writes A date at las">
            <path className={styles.guide} d={heartPath} />
            <path ref={wash} className={styles.wash} d={heartPath} />
            <path ref={stroke} className={styles.stroke} d={heartPath} pathLength="1" strokeDasharray="1 1" strokeDashoffset="1" />
            <g ref={lettering} className={styles.wordmark} transform={`translate(${nameOrigin.x} ${nameOrigin.y}) scale(${nameScale})`} aria-hidden="true">
              {nameStrokes.map(({ path, underline }) => <path key={path} className={underline ? styles.underline : undefined} d={path} pathLength="1" strokeDasharray="1 1" strokeDashoffset="1" />)}
            </g>
            <g ref={hand} className={styles.hand} transform="translate(240 130)">
              <ellipse cx="49" cy="66" rx="40" ry="9" fill="#713c3410" transform="rotate(40 49 66)" />
              <path d="M61 65 87 85 103 67 77 49Z" fill="#d91335" stroke="#a5102d" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="m57 64 10 10 17-17-10-10Z" fill="white" stroke="#b96b6b" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M64 68 42 60C33 57 28 52 23 44L12 31C8 26 9 21 13 19 18 17 23 21 29 27L26 18C23 11 25 7 29 6 34 5 38 11 42 20 45 14 50 16 54 22L58 28C61 22 67 25 70 31L79 46C84 55 81 61 75 67L69 73Z" fill="#f4cfb5" stroke="#925749" strokeWidth="1.8" strokeLinejoin="round" />
              <g transform="rotate(-45)">
                <path d="M0 0-3.5 9H3.5Z" fill="#b20d2d" />
                <rect x="-4" y="9" width="8" height="53" rx="3" fill="#d91335" stroke="#a5102d" strokeWidth="1.2" />
                <path d="M-1.5 13v42" stroke="#ffffff8f" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M-3.5 46h7" stroke="white" strokeWidth="2.5" />
              </g>
              <path d="M21 27C25 24 29 26 33 30L42 38C45 41 44 46 41 48 38 50 34 48 30 45L21 38" fill="#f4cfb5" stroke="#925749" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m43 23 9 14m7-9 8 12m-25 9 11 10" fill="none" stroke="#b07b62" strokeWidth="1.3" strokeLinecap="round" />
              <path d="m13 23 5 2m28-15 3 4" fill="none" stroke="#fff3e8" strokeWidth="2" strokeLinecap="round" />
            </g>
          </svg>
        </div>
        <p className={styles.caption} role="status">A little love is on its way<span aria-hidden="true">…</span></p>
      </div>
      <div className={styles.footer}>
        {onContinue && drawingComplete && <SwipeToContinue onContinue={complete} />}
      </div>
    </main>
  );
}
