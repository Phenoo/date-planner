"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { dateStorySteps } from "./date-story";

function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedDateFlow() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getReducedMotion,
    () => true,
  );
  const container = useRef<HTMLDivElement>(null);
  const playing = visible && !paused && !reducedMotion && !focused;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setActive((previous) => (previous + 1) % dateStorySteps.length),
      2800,
    );
    return () => window.clearInterval(timer);
  }, [playing]);
  return (
    <div
      ref={container}
      className={`date-flow ${playing ? "is-playing" : ""}`}
      onFocusCapture={(event) =>
        setFocused(
          event.target instanceof Element &&
            !!event.target.closest(".date-flow-stops"),
        )
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="date-flow-heading">
        <span className="mini-label">ONE DAY. A FEW LOVELY MOMENTS.</span>
        {!reducedMotion && (
          <button
            aria-label={
              paused ? "Play date flow animation" : "Pause date flow animation"
            }
            aria-pressed={paused}
            onClick={() => setPaused((previous) => !previous)}
          >
            {paused ? "Play" : "Pause"}
          </button>
        )}
      </div>
      <div className="date-flow-photo">
        {dateStorySteps.map((scene, index) => (
          <Image
            key={scene.image}
            src={scene.image}
            alt={index === active ? scene.alt : ""}
            aria-hidden={index !== active}
            fill
            loading={visible ? "eager" : "lazy"}
            sizes="(max-width:700px) 85vw, 35vw"
            className={`flow-scene-image ${index === active ? "is-active" : ""}`}
          />
        ))}
        <div />
        <span>
          0{active + 1} <small>/ 03</small>
        </span>
        <p>
          A little art. A little dinner.
          <br />A lot of connection.
        </p>
      </div>
      <ol className="date-flow-stops">
        {dateStorySteps.map((item, index) => (
          <li key={item.title} className={index === active ? "is-active" : ""}>
            <button
              aria-current={index === active ? "step" : undefined}
              onClick={() => setActive(index)}
            >
              <span className="flow-stop-number">0{index + 1}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="date-flow-note">
        An illustrative flow. Your actual plan follows your preferences, time,
        and budget.
      </p>
    </div>
  );
}
