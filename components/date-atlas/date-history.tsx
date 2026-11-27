"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { z } from "zod";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { dateHistoryResponseSchema, type ChosenDate } from "@/lib/planner/invitations";
import { dateTimingLabel } from "@/lib/planner/date-story";
import type { PlanRequest } from "@/lib/planner/schema";
import { Button } from "@/components/ui/button";
import { DateActions } from "./date-actions";
import styles from "./date-history.module.css";

function DatePhoto({ date }: { date: ChosenDate }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = date.place?.photo;
  if (!photo || failed === photo.url) return <div className={styles.photoFallback} aria-hidden="true"><MapPin size={32} /></div>;
  return <figure className={styles.photo}>
    <Image src={photo.url} alt={date.source === "catalog" ? "Illustrative date atmosphere" : `A view of ${date.place?.name ?? "your chosen place"}`} fill unoptimized loading="lazy" sizes="(max-width:700px) 100vw, 50vw" onError={() => setFailed(photo.url)} />
    <figcaption className={styles.photoCredit}>{date.source === "catalog" ? <span>Illustrative photo</span> : <a href={photo.sourceUrl ?? date.place?.mapsUrl} target="_blank" rel="noreferrer" translate="no">Google Maps</a>}{photo.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}</figcaption>
  </figure>;
}

export function DateHistory({ onPlan, onChanged, onReplan }: { onPlan: () => void; onChanged: () => void; onReplan: (request: PlanRequest) => void }) {
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
    if (actionController.current || updating || loadingMore) return;
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
    if (!nextCursor || actionController.current || loadingMore || updating) return;
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
  return <section className={styles.section} aria-label="Saved dates">
    <div className={styles.filters}>{([{ value: "all", label: "All dates" }, { value: "planned", label: "Planned" }, { value: "completed", label: "Done" }] as const).map((tab) => <button key={tab.value} type="button" disabled={loadingMore || !!updating} aria-pressed={filter === tab.value} onClick={() => { if (tab.value === filter) return; setFilter(tab.value); setLoading(true); setError(""); setDates([]); setNextCursor(null); }}>{tab.label}</button>)}</div>
    {loading ? <p className={styles.empty} role="status">Loading your dates…</p> : visible.length ? <div className={styles.grid}>{visible.map((date) => <article key={date.id} className={styles.card}>
      <DatePhoto date={date} />
      <div className={styles.body}>
        <span className={styles.status}>{date.dateStatus === "completed" ? "Done" : date.suggestedVibe ? "New vibe suggested" : date.suggestedTime ? "New time suggested" : !date.invitationPublished ? "Saved privately" : date.invitationRevoked ? "Invitation revoked" : date.response === "accepted" ? "They said yes" : date.response === "declined" ? "Another time" : "Invitation pending"}</span>
        <h3>{date.title ?? date.place?.name ?? date.story.title}</h3><p className={styles.meta}>{dateTimingLabel(date.datePreference, date.startTime, date.dateStatus === "completed", date.date)} · {date.city}</p>
        {date.place?.attributions.length ? <div className={styles.attributions}>{date.place.attributions.map((item, index) => item.url ? <a key={`${item.name}:${index}`} href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : <span key={`${item.name}:${index}`}>{item.name}</span>)}</div> : null}
        <DateActions date={date} disabled={!!updating || loadingMore} completing={updating === date.id} onComplete={() => void complete(date.id)} onRevoked={() => setDates((previous) => previous.map((item) => item.id === date.id ? { ...item, invitationRevoked: true } : item))} onChanged={() => { setLoading(true); setRevision((value) => value + 1); onChanged(); }} onReplan={onReplan} onBackupChanged={(backupPlaceId) => setDates((previous) => previous.map((item) => item.id === date.id ? { ...item, backupPlaceId } : item))} />
      </div>
    </article>)}</div> : !error && <div className={styles.empty}><p>{filter === "completed" ? "The dates you mark as done will appear here." : filter === "planned" ? "Your next plan will appear here." : "Save a date you love to keep it here."}</p><Button onClick={onPlan}>Plan a date</Button></div>}
    {error && <p className="error-message" role="alert">{error}</p>}<div className={styles.pagination}>{nextCursor && <Button variant="outline" disabled={loadingMore || !!updating} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more dates"}</Button>}<button type="button" disabled={loading || loadingMore || !!updating} onClick={() => { setLoading(true); setError(""); setRevision((value) => value + 1); }}>Refresh dates</button></div>
  </section>;
}
