"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { metricsResponseSchema } from "@/lib/analytics/metrics";
import styles from "./journey-dashboard.module.css";

const labels: Record<string, string> = { planner_started: "Started planning", planner_completed: "Submitted preferences", recommendation_succeeded: "Received a recommendation", recommendation_accepted: "Accepted a recommendation", plan_saved: "Saved a date", invitation_created: "Created an invitation" };
export function JourneyDashboard() {
  const [data, setData] = useState<z.infer<typeof metricsResponseSchema> | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setError("");
    try {
      const response = await plannerFetch("/api/admin/metrics", { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]) });
      const value = metricsResponseSchema.parse(await readPlanningResponse(response, () => {}));
      if (!request.signal.aborted) setData(value);
    } catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "The dashboard couldn’t be loaded."); }
    finally { if (!request.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return <section className={styles.dashboard} aria-label="Planning completion and mobile usability"><div className={styles.heading}><div><h2>From an idea to a date.</h2><p>Planning journeys and real browser performance · last 30 days.</p></div><Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading measurements…" : "Load dashboard"}</Button></div>{error && <p role="alert">{error}</p>}{data && <>{data.sampled && <p className={styles.notice}>Recent-record sample: each source is limited to 1,500 records. These rates do not represent the full population.</p>}<div className={styles.cards}><div><span>Started journeys</span><strong>{data.journeys.started}</strong></div><div><span>Preferences completed</span><strong>{data.journeys.completionRate === null ? "No data" : `${Math.round(data.journeys.completionRate * 100)}%`}</strong></div><div><span>Still in progress</span><strong>{data.journeys.pending}</strong></div></div><div className={styles.columns}><section><h3>Planning funnel</h3><p>Distinct, newly instrumented journeys that started planning. Repeat events count once per journey.</p><table><thead><tr><th>Step</th><th>Journeys</th><th>Of starts</th></tr></thead><tbody>{data.journeys.funnel.map((stage) => <tr key={stage.event}><th scope="row">{labels[stage.event] ?? stage.event}</th><td>{stage.count}</td><td>{data.journeys.started ? `${Math.round(stage.count / data.journeys.started * 100)}%` : "—"}</td></tr>)}</tbody></table></section><section><h3>Where planning pauses</h3><p>Latest question in journeys with no submission recorded after 30 minutes of inactivity. This is an observation, not a permanent abandonment claim.</p>{data.journeys.dropoffs.length ? <ul>{data.journeys.dropoffs.map((step) => <li key={step.step}>{step.step === "not-recorded" ? "Question not recorded" : step.step}: {step.count}</li>)}</ul> : <p>No paused journeys in this sample.</p>}</section></div><h3>Real mobile and desktop usability</h3><p>75th percentile of page-load measurements. LCP measures loading, INP responsiveness and CLS layout movement. No data means no score has been collected.</p><div className={styles.table}><table><thead><tr><th>Device</th><th>Metric</th><th>Samples</th><th>75th percentile</th><th>Status</th></tr></thead><tbody>{data.vitals.map((metric) => <tr key={`${metric.device}:${metric.name}`}><th scope="row">{metric.device}</th><td>{metric.name}</td><td>{metric.count}</td><td>{metric.p75 === null ? "—" : metric.name === "CLS" ? metric.p75.toFixed(3) : `${Math.round(metric.p75)} ms`}</td><td>{metric.rating.replace(/-/g, " ")}</td></tr>)}</tbody></table></div><p className={styles.notice}>Only step names, short-lived journey hashes and performance measurements are recorded. Chat text, precise location, account identifiers and private link tokens are excluded.</p></>}</section>;
}
