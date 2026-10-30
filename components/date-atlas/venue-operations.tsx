"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { venueAdminResponseSchema, venueControlSchema } from "@/lib/planner/venue-control";
import { z } from "zod";
import { funnelEvents } from "@/lib/planner/funnel";

export function VenueOperations() {
  const [data, setData] = useState<z.infer<typeof venueAdminResponseSchema>>({ controls: [], reports: [] });
  const [form, setForm] = useState({ placeId: "", disabled: true, note: "", sourceUrl: "", verifiedAt: new Date().toISOString().slice(0, 10) });
  const [counts, setCounts] = useState<{ event: string; count: number }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(signal: AbortSignal) {
    const [controls, metrics] = await Promise.all([
      plannerFetch("/api/admin/venue-controls", { signal, cache: "no-store" }).then((response) => readPlanningResponse(response, () => {})).then((value) => venueAdminResponseSchema.parse(value)),
      plannerFetch("/api/funnel", { signal, cache: "no-store" }).then((response) => readPlanningResponse(response, () => {})).then((value) => z.object({ counts: z.array(z.object({ event: z.enum(funnelEvents), count: z.number().nonnegative() })) }).parse(value)),
    ]);
    if (!signal.aborted) { setData(controls); setCounts(metrics.counts); }
  }
  async function run(body?: unknown) {
    if (active.current) return;
    active.current = true;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setMessage("");
    try {
      if (body) await readPlanningResponse(await plannerFetch("/api/admin/venue-controls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]) }), () => {});
      await load(AbortSignal.any([current.signal, AbortSignal.timeout(20000)]));
      if (!current.signal.aborted) setMessage(body ? "Venue control saved. Recommendations and invitation reads now use this status." : "Venue controls and unresolved reports loaded.");
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : "Couldn't load venue controls."); }
    finally { active.current = false; if (!current.signal.aborted) setBusy(false); }
  }
  return <section className="data-notice" aria-label="Venue quality controls"><h2>Venue quality controls</h2><p>Disable unsuitable places, check their source, then re-enable them after correction. Google Maps facts are refreshed from Google; correct source details there rather than overriding them here. Keep customer information out of verification notes.</p><Button variant="outline" disabled={busy} onClick={() => void run()}>Load controls and reports</Button><div className="admin-columns"><form className="form-stack" onSubmit={(event) => { event.preventDefault(); const parsed = venueControlSchema.safeParse(form); if (!parsed.success) { setMessage("Check all fields and use an HTTPS source URL."); return; } void run({ action: "control", ...parsed.data }); }}><label className="field"><span>Venue or Google Place ID</span><input required maxLength={200} value={form.placeId} onChange={(event) => setForm({ ...form, placeId: event.target.value })} /></label><label><input type="checkbox" checked={form.disabled} onChange={(event) => setForm({ ...form, disabled: event.target.checked })} /> Disable recommendations and shared venue access</label><label className="field"><span>Verification source URL</span><input required type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} /></label><label className="field"><span>Last checked</span><input required type="date" max={new Date().toISOString().slice(0, 10)} value={form.verifiedAt} onChange={(event) => setForm({ ...form, verifiedAt: event.target.value })} /></label><label className="field"><span>Verification note</span><textarea required minLength={3} maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><Button type="submit" disabled={busy}>Save venue control</Button></form><div><h3>Unresolved reports</h3>{!data.reports.length && <p>No loaded reports.</p>}{data.reports.map((report) => <div key={report.id}><p>{report.placeId} · {report.reason} · {report.createdAt.slice(0, 10)}</p><Button variant="outline" disabled={busy} onClick={() => setForm({ ...form, placeId: report.placeId, disabled: true })}>Review place</Button><Button variant="outline" disabled={busy} onClick={() => void run({ action: "resolve", id: report.id })}>Mark reviewed</Button></div>)}<h3>Current controls</h3>{data.controls.map((control) => <button type="button" key={control.placeId} onClick={() => setForm(control)}>{control.placeId} · {control.disabled ? "Disabled" : "Enabled"}</button>)}</div></div><h3>Journey events · last 30 days</h3><p>Deduplicated action counts, not unique customers or revenue.</p>{counts.map((item) => <p key={item.event}>{item.event}: {item.count}</p>)}{message && <p role="status">{message}</p>}</section>;
}
