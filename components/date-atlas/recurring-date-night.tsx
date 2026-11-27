"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getBrowserAuth } from "@/lib/firebase/client";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { recurringDateScheduleSchema, recurringDateSettingsSchema } from "@/lib/membership/recurring-date-night";
import { currencyDigits, currencyForCountry } from "@/lib/planner/currency";
import { activeDiscoveryKey } from "@/lib/planner/discovery-session";
import { draftJSON, plannerDraftKey } from "@/lib/planner/draft-retention";
import { plannerDraftVersion } from "@/lib/planner/questions";
import { calendarLabel, clockLabel, timeMinutes } from "@/lib/planner/schedule";
import { requestSchema, vibes } from "@/lib/planner/schema";
import styles from "./membership.module.css";

type Schedule = z.infer<typeof recurringDateScheduleSchema>;
const scheduleResponse = z.object({ schedule: recurringDateScheduleSchema.nullable() });
const reviewResponse = z.object({
  request: requestSchema,
  reference: z.object({ sessionId: z.uuid(), placeId: z.string(), expiresAt: z.number() }).nullable(),
});
const frequencies = { weekly: "Every week", biweekly: "Every two weeks", monthly: "Every month" };

async function recurringRequest(body: object, signal: AbortSignal) {
  const response = await plannerFetch("/api/membership/recurring", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
  });
  return readPlanningResponse(response, () => {});
}

export function RecurringDateNight({ ownerId, entitled, countries }: {
  ownerId: string;
  entitled: boolean;
  countries: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<Schedule | null>();
  const [editing, setEditing] = useState(false);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<AbortController | null>(null);
  const hasAccount = useCallback((signal: AbortSignal) => !signal.aborted && getBrowserAuth()?.currentUser?.uid === ownerId, [ownerId]);

  const load = useCallback(async (signal: AbortSignal) => {
    const result = scheduleResponse.parse(await recurringRequest({ action: "read" }, signal));
    if (hasAccount(signal)) setSchedule(result.schedule);
  }, [hasAccount]);

  useEffect(() => {
    const controller = new AbortController();
    void recurringRequest({ action: "read" }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then((data) => {
      if (hasAccount(controller.signal)) setSchedule(scheduleResponse.parse(data).schedule);
    }).catch((failure: unknown) => {
      if (hasAccount(controller.signal)) setError(failure instanceof Error ? failure.message : "Your date night couldn’t be loaded.");
    });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [hasAccount]);

  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setNotice("");
    try { await work(AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])); }
    catch (failure) {
      if (hasAccount(controller.signal)) setError(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "Your date night couldn’t be updated. Try again.");
    } finally {
      pending.current = null;
      if (hasAccount(controller.signal)) setBusy(false);
    }
  }

  function review(usePreferences = false) {
    void run(async (signal) => {
      const result = reviewResponse.parse(await recurringRequest({ action: "review", usePreferences }, signal));
      if (!hasAccount(signal)) return;
      const flow = crypto.randomUUID();
      const identity = { flow, ownerId };
      const draft = draftJSON({ ...identity, version: plannerDraftVersion, request: result.request, plannerMode: "steps", step: 0 });
      sessionStorage.setItem(plannerDraftKey, draft);
      if (result.reference) sessionStorage.setItem(activeDiscoveryKey, JSON.stringify({ ...identity, ...result.reference, accepted: false }));
      router.push(`/plan?flow=${flow}`);
    });
  }

  if (!entitled && !schedule) return null;
  const currency = currencyForCountry(country);
  return <section id="recurring-date-night" className={styles.recurring} aria-labelledby="recurring-date-heading" aria-busy={busy || schedule === undefined && !error}>
    <h2 id="recurring-date-heading">Recurring date night</h2>
    {schedule === undefined && !error && <p role="status">Opening your date night…</p>}
    {schedule === undefined && error && <Button type="button" variant="outline" disabled={busy} onClick={() => void run(load)}>Try again</Button>}
    {schedule === null && !editing && entitled && <>
      <p>Choose a rhythm and we’ll look for a date idea two days before each date night. We’ll email you when it’s ready if your account email is verified.</p>
      <Button type="button" onClick={() => { setCountry(""); setEditing(true); }}>Set up date night</Button>
    </>}
    {schedule && !editing && <>
      <p>{frequencies[schedule.cadence]} at {clockLabel(timeMinutes(schedule.startTime))} in {schedule.area ? `${schedule.area}, ` : ""}{schedule.city}.</p>
      {entitled
        ? <p>Next scheduled date night: {calendarLabel(schedule.latest?.date ?? schedule.nextDate)}.</p>
        : <p>Your schedule is paused while Plus is inactive.</p>}
      {entitled && schedule.latest && <>
        <p>{schedule.latest.hasVenue ? "Your date idea is ready to review and share." : "We couldn’t find a matching venue. Open your saved preferences to plan this date."}</p>
        <div className={styles.recurringActions}>
          <Button type="button" disabled={busy} onClick={() => review()}>{schedule.latest.hasVenue ? "Review date idea" : "Plan this date"}</Button>
          {schedule.latest.hasVenue && <Button type="button" variant="outline" disabled={busy} onClick={() => review(true)}>Find another idea</Button>}
        </div>
      </>}
      <div className={styles.recurringActions}>
        {entitled && <Button type="button" variant="outline" disabled={busy} onClick={() => { setCountry(schedule.country); setEditing(true); }}>Edit schedule</Button>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void run(async (signal) => {
          await recurringRequest({ action: "stop" }, signal);
          if (!hasAccount(signal)) return;
          setSchedule(null); setNotice("Recurring date night stopped.");
        })}>Stop recurring dates</Button>
      </div>
    </>}
    {entitled && editing && <form className="form-stack" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const budget = form.get("budget");
      const settings = recurringDateSettingsSchema.safeParse({
        country: form.get("country"), city: form.get("city"), area: String(form.get("area") ?? "").trim() || undefined,
        cadence: form.get("cadence"), firstDate: form.get("firstDate"), startTime: form.get("startTime"),
        budget: budget ? Number(budget) : null, vibe: form.get("vibe"),
      });
      if (!settings.success) { setError("Check your date-night details and try again."); return; }
      void run(async (signal) => {
        const result = scheduleResponse.parse(await recurringRequest({ action: "save", settings: settings.data }, signal));
        if (!hasAccount(signal)) return;
        setSchedule(result.schedule); setEditing(false); setNotice("Date-night schedule saved.");
      });
    }}>
      <div className={styles.recurringFields}>
        <label className="field"><span>Country for your date</span><select name="country" value={country} onChange={event => setCountry(event.target.value)} required disabled={busy}>
          <option value="">Choose a country</option>{countries.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}
        </select></label>
        <label className="field"><span>City</span><input name="city" required minLength={2} maxLength={80} defaultValue={schedule?.city} disabled={busy} /></label>
        <label className="field"><span>Neighborhood (optional)</span><input name="area" minLength={2} maxLength={80} defaultValue={schedule?.area} disabled={busy} /></label>
        <label className="field"><span>Budget for two{currency ? ` (${currency})` : ""} (optional)</span><input name="budget" type="number" min={0} max={10000000} step={10 ** -(currency ? currencyDigits(currency) : 2)} defaultValue={schedule?.budget ?? ""} disabled={busy} /></label>
        <label className="field"><span>First date night</span><input name="firstDate" type="date" required defaultValue={schedule?.firstDate} disabled={busy} /></label>
        <label className="field"><span>Local start time</span><input name="startTime" type="time" required defaultValue={schedule?.startTime ?? "19:00"} disabled={busy} /></label>
        <label className="field"><span>Repeat</span><select name="cadence" defaultValue={schedule?.cadence ?? "biweekly"} disabled={busy}>{Object.entries(frequencies).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Vibe</span><select name="vibe" defaultValue={schedule?.vibe ?? "Romantic"} disabled={busy}>{vibes.map(vibe => <option key={vibe}>{vibe}</option>)}</select></label>
      </div>
      <div className={styles.recurringActions}>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save schedule"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</Button>
      </div>
    </form>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
