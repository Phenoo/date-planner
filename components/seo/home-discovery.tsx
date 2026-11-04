import Link from "next/link";
import styles from "./public-content.module.css";

export function HomeDiscovery() {
  return <section className={styles.discovery} aria-labelledby="date-planning-heading">
    <span className={styles.eyebrow}>A LITTLE THOUGHT. A LOVELY DATE.</span>
    <h1 id="date-planning-heading">Date ideas that feel like you.</h1>
    <p>A first date, an anniversary, or a little time together. a date at las helps turn your ideas into a thoughtful plan around your city, interests, time and budget.</p>
    <div className={styles.steps}>
      <section><h2>Start with your kind of together.</h2><p>Choose a city and how far you want to travel. Share the occasion, the atmosphere you enjoy and a comfortable spending limit.</p></section>
      <section><h2>Talk it through with Oge.</h2><p>Type your ideas, use optional voice input where supported, or answer one question at a time. Oge helps fill in the details you have missed.</p></section>
      <section><h2>Make room for the moment.</h2><p>Review nearby suggestions where venue information is available. Check opening hours, costs and any booking or access needs before you go.</p></section>
    </div>
    <div className={styles.links}><Link className={styles.primary} href="/plan">Plan a date</Link><Link href="/date-ideas">Find your next date idea ↗</Link><Link href="/explore">Explore published experiences ↗</Link></div>
  </section>;
}
