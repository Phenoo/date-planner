import { z } from "zod";
import { addCalendarDays, calendarDay, timeMinutes } from "@/lib/planner/schedule";

const datePoint = z.object({ year: z.number(), month: z.number(), day: z.number() });
const point = z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23).default(0), minute: z.number().int().min(0).max(59).default(0), date: datePoint.optional() });
export const openingHoursSchema = z.object({ periods: z.array(z.object({ open: point, close: point.optional() })).optional(), weekdayDescriptions: z.array(z.string()).default([]) });
const money = z.object({ currencyCode: z.string(), units: z.string().default("0"), nanos: z.number().default(0) });
export const providerFactsSchema = z.object({
  regularOpeningHours: openingHoursSchema.optional(), currentOpeningHours: openingHoursSchema.optional(),
  timeZone: z.object({ id: z.string() }).optional(),
  priceRange: z.object({ startPrice: money.optional(), endPrice: money.optional() }).optional(),
  rating: z.number().min(0).max(5).optional(), userRatingCount: z.number().nonnegative().optional(),
  websiteUri: z.string().optional(), nationalPhoneNumber: z.string().optional(),
  accessibilityOptions: z.object({ wheelchairAccessibleEntrance: z.boolean().optional() }).optional(),
  servesVegetarianFood: z.boolean().optional(),
  reviews: z.array(z.object({ rating: z.number().optional(), text: z.object({ text: z.string() }).optional(), relativePublishTimeDescription: z.string().optional(), authorAttribution: z.object({ displayName: z.string(), uri: z.string().optional() }) })).default([]),
});
export type ProviderFacts = z.infer<typeof providerFactsSchema>;
type Period = NonNullable<ProviderFacts["regularOpeningHours"]>["periods"];
function mergedCoverage(intervals: [number, number][], start: number, end: number) {
  let covered = start;
  for (const [open, close] of intervals.sort((a, b) => a[0] - b[0])) {
    if (open > covered) break;
    if (close > covered) covered = close;
    if (covered >= end) return true;
  }
  return false;
}
function absolutePoint(value: z.infer<typeof point>) {
  if (!value.date) return null;
  const { year, month, day } = value.date;
  return Date.UTC(year, month - 1, day) / 60000 + value.hour * 60 + value.minute;
}
export function venueOpeningStatus(facts: ProviderFacts, date: string, start: number, duration: number, now = new Date()): "fits" | "closed" | "unknown" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start)) return "unknown";
  const targetDate = addCalendarDays(date, Math.floor(start / 1440));
  let localToday = "";
  try { if (facts.timeZone?.id) localToday = new Intl.DateTimeFormat("en-CA", { timeZone: facts.timeZone.id, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); } catch { /* Unknown timezone leaves current exceptional hours unconfirmed. */ }
  const current = facts.currentOpeningHours?.periods;
  if (current && localToday && targetDate >= localToday && targetDate <= addCalendarDays(localToday, 6)) {
    if (!current.length) return "closed";
    const startAbsolute = Date.parse(`${date}T00:00:00Z`) / 60000 + start;
    const absolute: [number, number][] = [];
    for (const period of current) {
      const open = absolutePoint(period.open), close = period.close ? absolutePoint(period.close) : null;
      if (open !== null && close !== null) absolute.push([open, close]);
    }
    if (absolute.length === current.length) return mergedCoverage(absolute, startAbsolute, startAbsolute + duration) ? "fits" : "closed";
  }
  const periods: Period = facts.regularOpeningHours?.periods;
  if (!periods) return "unknown";
  if (!periods.length) return "closed";
  if (periods.some(({ open, close }) => !close && open.day === 0 && open.hour === 0 && open.minute === 0)) return "fits";
  if (periods.some(({ close }) => !close)) return "unknown";
  const startWeekly = calendarDay(date) * 1440 + start;
  const intervals: [number, number][] = [];
  for (const { open, close } of periods) {
    if (!close) continue;
    const from = open.day * 1440 + open.hour * 60 + open.minute;
    let to = close.day * 1440 + close.hour * 60 + close.minute;
    if (to <= from) to += 10080;
    for (const offset of [-10080, 0, 10080]) intervals.push([from + offset, to + offset]);
  }
  return mergedCoverage(intervals, startWeekly, startWeekly + duration) ? "fits" : "closed";
}
export function providerPrice(facts: ProviderFacts) {
  const lower = facts.priceRange?.startPrice, upper = facts.priceRange?.endPrice;
  const amount = (value: z.infer<typeof money> | undefined) => value ? Number(value.units) + value.nanos / 1e9 : undefined;
  const min = amount(lower), max = amount(upper), currency = lower?.currencyCode ?? upper?.currencyCode;
  if (!currency || !/^[A-Z]{3}$/.test(currency) || lower && upper && lower.currencyCode !== upper.currencyCode || min !== undefined && (!Number.isFinite(min) || min < 0) || max !== undefined && (!Number.isFinite(max) || max < 0) || min !== undefined && max !== undefined && min > max) return undefined;
  return { currency, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}
export function travelEstimate(distanceKm: number, method = "Ride-hailing") {
  return Math.max(method === "Walking" ? 1 : 5, Math.ceil(distanceKm * 1.35 / (method === "Walking" ? 4.5 : 22) * 60));
}
export function fitsVenueRequest(facts: ProviderFacts, request: { date: string; startTime: string; duration: number; budget: number | null; budgetType: string; guests: number; includeTransport: boolean; transport: string; accessibility: boolean; dietary: string[] }, distanceKm: number) {
  const travel = travelEstimate(distanceKm, request.transport);
  if (travel * 2 + 30 > request.duration) return false;
  if (request.accessibility && facts.accessibilityOptions?.wheelchairAccessibleEntrance !== true) return false;
  if (request.dietary.some((need) => need !== "vegetarian") || request.dietary.includes("vegetarian") && facts.servesVegetarianFood !== true) return false;
  const opening = venueOpeningStatus(facts, request.date, timeMinutes(request.startTime) + travel, Math.max(30, request.duration - travel * 2));
  if (opening === "closed") return false;
  const price = providerPrice(facts);
  if (request.budget !== null && price?.currency === "NGN" && price.min !== undefined) {
    const total = request.budget * (request.budgetType === "per-person" ? request.guests : 1);
    if (price.min * request.guests > total) return false;
  }
  return true;
}
