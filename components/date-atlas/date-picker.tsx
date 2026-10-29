"use client";
import { useRef, useState } from "react";
import { addCalendarDays, calendarDay, calendarLabel, dateValue } from "@/lib/planner/schedule";
import styles from "./date-picker.module.css";

export function DatePicker({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [today] = useState(() => dateValue(new Date()));
  const [week, setWeek] = useState(() => value && value >= today ? value : today);
  const [weekend, setWeekend] = useState(false);
  const calendar = useRef<HTMLInputElement>(null);
  const saturday = addCalendarDays(today, calendarDay(today) === 0 ? -1 : (6 - calendarDay(today) + 7) % 7);
  function select(date: string) { onChange(date); setWeekend(false); }
  return <div className={styles.picker}>
    <div className={styles.quick} aria-label="Quick date choices">
      <button type="button" disabled={disabled} onClick={() => { setWeek(today); select(today); }}>Today</button>
      <button type="button" disabled={disabled} onClick={() => { const date = addCalendarDays(today, 1); setWeek(today); select(date); }}>Tomorrow</button>
      <button type="button" disabled={disabled} aria-expanded={weekend} onClick={() => setWeekend((open) => !open)}>This weekend</button>
      <button type="button" disabled={disabled} onClick={() => { calendar.current?.focus(); calendar.current?.showPicker?.(); }}>Choose a date</button>
    </div>
    {weekend && <div className={styles.weekend} aria-label="Choose your weekend day">{[saturday, addCalendarDays(saturday, 1)].filter((date) => date >= today).map((date) => <button key={date} type="button" onClick={() => { setWeek(date); select(date); }} disabled={disabled}>{calendarLabel(date, { weekday: "long", day: "numeric", month: "short" })}</button>)}</div>}
    <div className={styles.weekHeader}><button type="button" aria-label="Previous week" disabled={disabled || week <= today} onClick={() => setWeek((date) => addCalendarDays(date, -7) < today ? today : addCalendarDays(date, -7))}>←</button><strong>{calendarLabel(week, { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next week" disabled={disabled || week >= addCalendarDays(today, 358)} onClick={() => setWeek((date) => addCalendarDays(date, 7))}>→</button></div>
    <div className={styles.week} role="group" aria-label="Choose a date">{Array.from({ length: 7 }, (_, index) => addCalendarDays(week, index)).map((date) => <button key={date} type="button" disabled={disabled || date > addCalendarDays(today, 365)} aria-pressed={value === date} aria-label={calendarLabel(date)} onClick={() => select(date)}><span>{calendarLabel(date, { weekday: "short" })}</span><strong>{calendarLabel(date, { day: "numeric" })}</strong><small>{calendarLabel(date, { month: "short" })}</small></button>)}</div>
    <label className={styles.calendar}><span>Full calendar</span><input ref={calendar} type="date" aria-label="Choose a date from the calendar" value={value} min={today} max={addCalendarDays(today, 365)} disabled={disabled} onChange={(event) => { if (event.target.value) { setWeek(event.target.value); select(event.target.value); } }} /></label>
    <p className={styles.selected} role="status">{value ? calendarLabel(value) : "A day worth looking forward to."}</p>
  </div>;
}
