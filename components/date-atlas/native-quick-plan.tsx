"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { budgetSuggestions, formatMoney } from "@/lib/planner/currency";
import { addCalendarDays, calendarDay, zonedNow } from "@/lib/planner/schedule";
import type { PlanRequest } from "@/lib/planner/schema";
import { AtlasIcon, type AtlasIconName } from "./atlas-icon";
import styles from "./native-app.module.css";

const moods: { label: string; vibe: PlanRequest["vibes"][number]; icon: AtlasIconName }[] = [
  { label: "Dinner", vibe: "Food & dining", icon: "dinner" },
  { label: "Playful", vibe: "Playful", icon: "dice" },
  { label: "Outdoors", vibe: "Outdoors", icon: "discover-map" },
  { label: "Surprise", vibe: "Unexpected", icon: "heart-tag" },
];

export function NativeQuickPlan({ request, setRequest, onContinue }: {
  request: PlanRequest;
  setRequest: Dispatch<SetStateAction<PlanRequest>>;
  onContinue: (hasMood: boolean) => void;
}) {
  const today = zonedNow(request.timeZone).date;
  const day = calendarDay(today);
  const weekend = addCalendarDays(today, day === 0 ? 0 : 6 - day);
  const [showCalendar, setShowCalendar] = useState(Boolean(request.date && request.date !== today && request.date !== weekend));
  const suggestions = budgetSuggestions(request.currency);
  const max = Math.max(suggestions[suggestions.length - 1], request.budget ?? 0);
  function chooseDate(date: string) {
    setRequest(previous => ({ ...previous, date, datePreference: [0, 6].includes(calendarDay(date)) ? "weekend" : "weekday" }));
  }

  return <form className={styles.quickPlan} onSubmit={event => { event.preventDefault(); onContinue(moods.some(mood => request.vibes.includes(mood.vibe))); }}>
    <div className={styles.planIntro}><h1>A good date starts<br />with <em>a little you.</em></h1><p>We’ll connect the details.</p></div>
    <fieldset><legend>What’s the mood?</legend><div className={styles.moods}>{moods.map(mood =>
      <button type="button" key={mood.vibe} aria-pressed={request.vibes.includes(mood.vibe)} onClick={() => setRequest(previous => ({ ...previous, vibes: [mood.vibe] }))}>
        <AtlasIcon name={mood.icon} size={24} />{mood.label}
      </button>)}</div></fieldset>
    <fieldset><legend>When are we going?</legend><div className={styles.when}>
      <button type="button" aria-pressed={!showCalendar && request.date === today} onClick={() => { setShowCalendar(false); chooseDate(today); }}>Today</button>
      {weekend !== today && <button type="button" aria-pressed={!showCalendar && request.date === weekend} onClick={() => { setShowCalendar(false); chooseDate(weekend); }}>This weekend</button>}
      <button type="button" aria-expanded={showCalendar} onClick={() => setShowCalendar(!showCalendar)}>Pick a day</button>
    </div>{showCalendar && <input type="date" aria-label="Date for your plan" min={today} value={request.date} onChange={event => chooseDate(event.target.value)} />}</fieldset>
    <div><label className={styles.budgetLabel} htmlFor="native-plan-budget"><strong>{request.budgetType === "per-person" ? "Budget per person" : request.guests === 2 ? "Budget for two" : "Total budget"}</strong><span>{request.budget === null ? "Open" : formatMoney(request.budget, request.currency)}</span></label>
      <input id="native-plan-budget" type="range" min={0} max={max} step={Math.max(1, Math.floor(suggestions[0] / 10))} value={request.budget ?? 0} aria-valuetext={request.budget === null ? "Open budget" : formatMoney(request.budget, request.currency)} onChange={event => { const value = Math.round(Number(event.target.value)); setRequest(previous => ({ ...previous, budget: value })); }} />
      {request.budget !== null && <button type="button" className={styles.openBudget} onClick={() => setRequest(previous => ({ ...previous, budget: null }))}>Keep the budget open</button>}
    </div>
    <button type="submit" className={styles.primary}>Continue planning<AtlasIcon name="arrow-right" size={18} /></button>
  </form>;
}
