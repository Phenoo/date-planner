"use client";
import { useState } from "react";
import { addCalendarDays, calendarDay, calendarLabel, zonedNow } from "@/lib/planner/schedule";
import styles from "./date-picker.module.css";

export function DatePicker({ value, onChange, disabled = false, timeZone }: { value: string; onChange: (value: string) => void; disabled?: boolean; timeZone?: string }) {
  const [today] = useState(() => zonedNow(timeZone).date);
  const [weekend, setWeekend] = useState(false);
  const saturday = addCalendarDays(today, calendarDay(today) === 0 ? -1 : (6 - calendarDay(today) + 7) % 7);
  function select(date: string) { onChange(date); setWeekend(false); }
  return <div className={styles.picker}>
    <div className={styles.quick} aria-label="Quick date choices">
      <button type="button" disabled={disabled} onClick={() => select(today)}>Today</button>
      <button type="button" disabled={disabled} onClick={() => select(addCalendarDays(today, 1))}>Tomorrow</button>
      <button type="button" disabled={disabled} aria-expanded={weekend} onClick={() => setWeekend((open) => !open)}>This weekend</button>
      <label className={styles.calendarTrigger} data-disabled={disabled}>Choose a date<input type="date" aria-label="Choose a date from the calendar" value={value} min={today} max={addCalendarDays(today, 365)} disabled={disabled} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => { if (event.target.value) select(event.target.value); }} /></label>
    </div>
    {weekend && <div className={styles.weekend} aria-label="Choose your weekend day">{[saturday, addCalendarDays(saturday, 1)].filter((date) => date >= today).map((date) => <button key={date} type="button" onClick={() => select(date)} disabled={disabled}>{calendarLabel(date, { weekday: "long", day: "numeric", month: "short" })}</button>)}</div>}
    <p className={styles.selected} role="status">{value ? calendarLabel(value) : "A day worth looking forward to."}</p>
  </div>;
}
