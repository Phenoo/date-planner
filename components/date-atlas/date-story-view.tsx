import Image from "next/image";
import type { DateStory } from "@/lib/planner/date-story";
import { dateStoryVisuals } from "@/lib/planner/date-story-visuals";
import styles from "./date-journey.module.css";

export function DateStoryView({ story, category, label = "IMAGINE YOUR DATE" }: { story: DateStory; category?: string; label?: string }) {
  const visuals = dateStoryVisuals(category);
  return <section className={styles.story} aria-label="How your date could unfold">
    <span className={styles.eyebrow}>{label}</span><h2>{story.title}</h2><p className={styles.storyIntro}>{story.introduction}</p>
    <div className={styles.moments}>{story.moments.map((moment, index) => {
      const visual = visuals[index] ?? visuals[0];
      return <article key={`${index}:${moment.title}`}>
        <div className={`${styles.momentVisual} ${visual.illustration ? styles.momentIllustration : ""}`}>
          <Image src={visual.src} alt={visual.alt} fill loading="lazy" sizes="(max-width:700px) calc(100vw - 36px), (max-width:1120px) 32vw, 344px" />
          {!visual.illustration && <span className={styles.visualCaption} aria-hidden="true">Date inspiration</span>}
        </div>
        <div className={styles.momentCopy}><span className={styles.chapter}>0{index + 1}</span><h3>{moment.title}</h3><p>{moment.text}</p></div>
      </article>;
    })}</div>
    <p className={styles.ending}>{story.ending}</p>
  </section>;
}
