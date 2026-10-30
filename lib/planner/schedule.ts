import { z } from "zod";

export function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const defaultTimeZone = "Africa/Lagos";
export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function zonedNow(timeZone = defaultTimeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}
export function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function calendarDay(value: string) { return new Date(`${value}T12:00:00Z`).getUTCDay(); }
export function calendarLabel(value: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
export function scheduleError(request: { date: string; startTime: string; duration: number; endTime?: string; timeZone?: string }, today?: string, now = new Date()) {
  const current = zonedNow(request.timeZone, now);
  if (!z.iso.date().safeParse(request.date).success) return "Choose the actual day for your date.";
  if (request.date < (today ?? current.date)) return "Choose today or a future date.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(request.startTime)) return "Choose a time for your date.";
  if ((!today || today === current.date) && request.date === current.date && request.startTime <= current.time) return "That time has already passed. Choose a later time for your date.";
  if (request.endTime && request.endTime <= request.startTime) return "Your ending time must be after your starting time.";
  if (request.endTime && timeMinutes(request.startTime) + request.duration > timeMinutes(request.endTime)) return "Your duration runs past the ending time. Adjust either one.";
  return "";
}
export function timeMinutes(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
export function clockLabel(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  return `${hour % 12 || 12}:${String(normalized % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
