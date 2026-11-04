import type { DatePlan, PlanRequest } from "@/lib/planner/schema";
import { venueDecision, type DatePlace } from "@/lib/planner/readiness";
import styles from "./ready-for-date.module.css";

export function VenueDecisionFacts({ place, request, plan }: { place: DatePlace; request: PlanRequest; plan?: DatePlan }) {
  const facts = venueDecision(place, request, plan);
  return <div className={styles.facts} aria-label="Before you choose this place"><dl><div><dt>{facts.costLabel}</dt><dd>{facts.cost}</dd></div><div><dt>Getting there</dt><dd>{facts.travel}</dd></div><div><dt>Opening hours</dt><dd>{facts.opening}</dd></div></dl>{facts.missing.length > 0 && <ul className={styles.unknowns}>{facts.missing.map((item) => <li key={item}>{item}</li>)}</ul>}<p className={styles.booking}>A recommendation is not a reservation. Confirm availability with the venue.</p></div>;
}
