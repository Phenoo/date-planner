import type { DateStory } from "@/lib/planner/date-story";
import styles from "./date-journey.module.css";

export function DateStoryView({ story, label = "IMAGINE YOUR DATE" }: { story: DateStory; label?: string }) {
  return <section className={styles.story} aria-label="How your date could unfold">
    <span className={styles.eyebrow}>{label}</span><h2>{story.title}</h2><p className={styles.storyIntro}>{story.introduction}</p>
    <div className={styles.moments}>{story.moments.map((moment, index) => <article key={`${index}:${moment.title}`}><span className={styles.chapter}>0{index + 1}</span><h3>{moment.title}</h3><p>{moment.text}</p></article>)}</div>
    <p className={styles.ending}>{story.ending}</p>
  </section>;
}
