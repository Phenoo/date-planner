import { zonedNow } from "./schedule";
import type { PublicInvitation } from "./invitations";

export function calendarInstant(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a day and time before downloading your calendar event.");
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  for (let index = 0; index < 4; index++) {
    const local = zonedNow(timeZone, new Date(instant));
    const offset = Date.parse(`${local.date}T${local.time}:00Z`) - target;
    if (!offset) return new Date(instant);
    instant -= offset;
  }
  throw new Error("That local time does not exist in this timezone. Choose another time.");
}
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n|\r/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
function fold(line: string) {
  const lines: string[] = []; let part = ""; let bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 75) { lines.push(part); part = " "; bytes = 1; }
    part += character; bytes += length;
  }
  return [...lines, part].join("\r\n");
}
export function dateCalendar(date: PublicInvitation, id: string) {
  const start = calendarInstant(date.date, date.startTime, date.timeZone);
  const end = new Date(start.getTime() + date.duration * 60000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//a date at las//Date invitation//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${id.replace(/[^a-zA-Z0-9-]/g, "")}@adal`, `DTSTAMP:${stamp(new Date(date.createdAt))}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeText(date.place?.name ? `A date at ${date.place.name}` : "A date at las")}`, `LOCATION:${escapeText(date.place?.address ?? date.city)}`, "DESCRIPTION:Personal date plan. Confirm venue hours and any booking directly with the venue.", "STATUS:TENTATIVE", "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}
