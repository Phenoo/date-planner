"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { dateHistoryResponseSchema, type ChosenDate } from "@/lib/planner/invitations";
import { dateTimingLabel } from "@/lib/planner/date-story";
import { Button } from "@/components/ui/button";
import styles from "./date-journey.module.css";

export function DateHistory({ onPlan }: { onPlan: () => void }) {
  const [dates, setDates] = useState<ChosenDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "planned" | "completed">("all");
  const actionController = useRef<AbortController | null>(null);
  useEffect(() => () => actionController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const suffix = filter === "all" ? "" : `?status=${filter}`;
        const data = dateHistoryResponseSchema.parse(await readPlanningResponse(await plannerFetch(`/api/date-history${suffix}`, { signal: controller.signal, cache: "no-store" }), () => {}));
        if (!controller.signal.aborted) { setDates(data.dates); setNextCursor(data.nextCursor); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your dates couldn't be loaded."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [revision, filter]);
  async function complete(id: string) {
    if (updating || loadingMore) return;
    const controller = new AbortController(); actionController.current = controller;
    setUpdating(id); setError("");
    try {
      const response = await plannerFetch("/api/date-history", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal: controller.signal });
      z.object({ completed: z.literal(true) }).parse(await readPlanningResponse(response, () => {}));
      if (!controller.signal.aborted) setDates((previous) => previous.map((date) => date.id === id ? { ...date, dateStatus: "completed" } : date));
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "This date couldn't be updated."); }
    finally { if (!controller.signal.aborted) { actionController.current = null; setUpdating(null); } }
  }
  async function loadMore() {
    if (!nextCursor || loadingMore || updating) return;
    const controller = new AbortController(); actionController.current = controller;
    setLoadingMore(true); setError("");
    try {
      const query = new URLSearchParams({ cursor: nextCursor });
      if (filter !== "all") query.set("status", filter);
      const data = dateHistoryResponseSchema.parse(await readPlanningResponse(await plannerFetch(`/api/date-history?${query}`, { signal: controller.signal, cache: "no-store" }), () => {}));
      if (!controller.signal.aborted) { setDates((previous) => [...new Map([...previous, ...data.dates].map((date) => [date.id, date])).values()]); setNextCursor(data.nextCursor); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "More dates couldn't be loaded."); }
    finally { if (!controller.signal.aborted) { actionController.current = null; setLoadingMore(false); } }
  }
  const visible = dates.filter((date) => filter === "all" || date.dateStatus === filter);
  return <section className={styles.history} aria-label="My dates"><div className={styles.historyHead}><span className={styles.eyebrow}>THE PLANS. THE YESES. THE MEMORIES.</span><h2>Your dates, in one place.</h2><p>Keep your chosen places, check their response, and remember the dates you&apos;ve done.</p></div>
    <div className={styles.historyFilters}>{([{ value: "all", label: "All dates" }, { value: "planned", label: "Planned" }, { value: "completed", label: "Done" }] as const).map((tab) => <button key={tab.value} type="button" disabled={loadingMore || !!updating} aria-pressed={filter === tab.value} onClick={() => { if (tab.value === filter) return; setFilter(tab.value); setLoading(true); setError(""); setDates([]); setNextCursor(null); }}>{tab.label}</button>)}</div>
    {loading ? <p className={styles.historyEmpty} role="status">Finding your little collection of dates…</p> : visible.length ? <div className={styles.historyGrid}>{visible.map((date) => <article key={date.id} className={styles.historyCard}>
      <span className={styles.badge}>{date.dateStatus === "completed" ? "A memory made" : date.response === "accepted" ? "They said yes" : date.response === "declined" ? "Another time" : "Invitation pending"}</span><h3>{date.place?.name ?? date.story.title}</h3><p>{dateTimingLabel(date.datePreference, date.startTime, date.dateStatus === "completed")} · {date.city}</p><p>{date.story.introduction}</p><div className={styles.actions}><Link href={`/invite/${date.token}`}>View invitation ↗</Link>{date.dateStatus !== "completed" && <Button variant="outline" disabled={!!updating || loadingMore} onClick={() => void complete(date.id)}>{updating === date.id ? "Saving…" : "Mark as done"}</Button>}</div>
    </article>)}</div> : !error && <div className={styles.historyEmpty}><p>{filter === "completed" ? "The dates you mark as done will appear here." : filter === "planned" ? "Your next little plan is waiting to happen." : "Choose a place you love. Your date will be kept here automatically."}</p><Button onClick={onPlan}>Plan a date</Button></div>}
    {error && <p className="error-message" role="alert">{error}</p>}<div className={styles.actions}>{nextCursor && <Button variant="outline" disabled={loadingMore || !!updating} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more dates"}</Button>}<button type="button" className={styles.textButton} disabled={loading || loadingMore || !!updating} onClick={() => { setLoading(true); setError(""); setRevision((value) => value + 1); }}>Refresh dates</button></div>
  </section>;
}
