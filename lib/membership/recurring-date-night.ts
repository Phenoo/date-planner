import { z } from "zod";
import { citySearchSchema } from "@/lib/maps/cities";
import { calendarInstant } from "@/lib/planner/calendar";
import { addCalendarDays, zonedNow } from "@/lib/planner/schedule";
import { requestSchema } from "@/lib/planner/schema";

export const recurringDateSettingsSchema = citySearchSchema.extend({
  area: requestSchema.shape.area.optional(),
  cadence: z.enum(["weekly", "biweekly", "monthly"]),
  firstDate: z.iso.date(),
  startTime: z.iso.time({ precision: -1 }),
  budget: requestSchema.shape.budget,
  vibe: requestSchema.shape.vibes.element,
});
export type RecurringDateSettings = z.infer<typeof recurringDateSettingsSchema>;
export const recurringDateScheduleSchema = recurringDateSettingsSchema.extend({
  timeZone: requestSchema.shape.timeZone,
  nextDate: z.iso.date(),
  latest: z.object({ date: z.iso.date(), hasVenue: z.boolean() }).nullable(),
});
export const recurringDateInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("save"), settings: recurringDateSettingsSchema }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("review"), usePreferences: z.boolean().optional() }),
]);

const dayMs = 86400000;
const calendarMs = (date: string) => Date.parse(`${date}T12:00:00Z`);

export function nextRecurringDate(settings: RecurringDateSettings & { timeZone: string }, now: number) {
  const local = zonedNow(settings.timeZone, new Date(now)).date;
  const [year, month, day] = settings.firstDate.split("-").map(Number);
  const [localYear, localMonth] = local.split("-").map(Number);
  const spacing = settings.cadence === "weekly" ? 7 : 14;
  const offset = settings.cadence === "monthly"
    ? Math.max(0, (localYear - year) * 12 + localMonth - month)
    : Math.max(0, Math.floor((calendarMs(local) - calendarMs(settings.firstDate)) / (dayMs * spacing)));
  for (let index = offset; index < offset + 4; index++) {
    const date = settings.cadence === "monthly"
      ? new Date(Date.UTC(year, month - 1 + index, Math.min(day, new Date(Date.UTC(year, month + index, 0)).getUTCDate()), 12)).toISOString().slice(0, 10)
      : addCalendarDays(settings.firstDate, index * spacing);
    try {
      const startsAt = calendarInstant(date, settings.startTime, settings.timeZone).getTime();
      if (startsAt > now) return { date, startsAt, sendAt: startsAt - 2 * dayMs };
    } catch {
      // Skip local times that do not exist when the clocks move forward.
    }
  }
  throw new Error("No upcoming occurrence could be calculated.");
}
