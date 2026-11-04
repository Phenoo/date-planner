"use client";
import { useEffect, useState } from "react";
import { AtlasCompanion } from "./atlas-companion";
import styles from "./walking-companion.module.css";

export function WalkingCompanion() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return <div className={styles.lane} aria-hidden="true" data-paused={hidden}>
    <div className={styles.walker}><div className={styles.direction}>
      <AtlasCompanion pose="walking" theme="red" lively idle={false} eager playing={!hidden} label="Oge, your animated heart companion" width={110} height={110} />
    </div></div>
  </div>;
}
