import { z } from "zod";
import { requestSchema, type PlanRequest } from "./schema";
import { plannerQuestions, type PlannerQuestionId } from "./questions";
import { calendarDay, calendarLabel, clockLabel, zonedNow, scheduleError, timeMinutes } from "./schedule";

export const intakeFields = ["location", "occasion", "people", "vibe", "budget", "date", "time", "duration"] as const;
export type IntakeField = typeof intakeFields[number];
export type PlannerMode = "chat" | "steps";
const fieldSchema = z.enum(intakeFields);
export const chatMessageSchema = z.object({ id: z.string().max(80), role: z.enum(["user", "assistant"]), text: z.string().min(1).max(1600) });
export const chatSessionSchema = z.object({ messages: z.array(chatMessageSchema).max(24), answered: z.array(fieldSchema).max(8), nextField: fieldSchema.nullable() });
export type ChatSession = z.infer<typeof chatSessionSchema>;
export const emptyChatSession = (): ChatSession => ({ messages: [], answered: [], nextField: "location" });
export const intakeInputSchema = z.object({
  request: requestSchema, message: z.string().trim().min(1).max(1200), today: z.iso.date(),
  answered: z.array(fieldSchema).max(8), nextField: fieldSchema.nullable(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(800) })).max(6).default([]),
});
export type IntakeInput = z.infer<typeof intakeInputSchema>;
const shape = requestSchema.shape;
const patchSchema = z.object({
  country: shape.country.unwrap().optional(), city: shape.city.optional(), currentCity: shape.currentCity.unwrap().optional(), area: shape.area.optional(), locationScope: shape.locationScope.unwrap().optional(),
  maxDistance: shape.maxDistance.unwrap().optional(), meetingTogether: shape.meetingTogether.unwrap().optional(), transport: shape.transport.unwrap().optional(),
  occasion: shape.occasion.optional(), budget: shape.budget.optional(), budgetType: shape.budgetType.unwrap().optional(), guests: shape.guests.unwrap().optional(),
  includeTransport: shape.includeTransport.unwrap().optional(), includeFood: shape.includeFood.unwrap().optional(), contingency: shape.contingency.unwrap().optional(),
  vibes: shape.vibes.optional(), interests: shape.interests.unwrap().optional(), dislikes: shape.dislikes.unwrap().optional(), dietary: shape.dietary.unwrap().optional(),
  accessibility: shape.accessibility.unwrap().optional(), quiet: shape.quiet.unwrap().optional(), surprises: shape.surprises.unwrap().optional(),
  date: shape.date.unwrap().optional(), startTime: shape.startTime.unwrap().optional(), duration: shape.duration.optional(), endTime: shape.endTime.unwrap().optional(),
  environment: shape.environment.unwrap().optional(), flexible: shape.flexible.unwrap().optional(), notes: shape.notes.unwrap().optional(), avoidRestaurants: shape.avoidRestaurants.unwrap().optional(),
});
export const intakeOutputSchema = z.object({ acknowledgement: z.string().trim().min(3).max(240), patch: patchSchema });
export const intakeReplySchema = z.object({ request: requestSchema, answered: z.array(fieldSchema).max(8), nextField: fieldSchema.nullable(), ready: z.boolean(), message: z.string().max(1000) });

const questionFields: Partial<Record<PlannerQuestionId, IntakeField>> = { city: "location", area: "location", occasion: "occasion", people: "people", vibes: "vibe", budget: "budget", date: "date", time: "time", duration: "duration" };
export function answeredThroughStep(step: number): IntakeField[] {
  return [...new Set(plannerQuestions.slice(0, step).flatMap(({ id }) => questionFields[id] ? [questionFields[id]!] : []))];
}
export function intakeNextField(request: PlanRequest, answered: readonly IntakeField[], today = zonedNow(request.timeZone).date): IntakeField | null {
  const missing = intakeFields.find((field) => !answered.includes(field));
  if (missing) return missing;
  if (!request.date || request.date < today) return "date";
  const current = zonedNow(request.timeZone);
  if (!request.startTime || today === current.date && request.date === current.date && request.startTime <= current.time) return "time";
  if (scheduleError(request, today)) return "duration";
  return null;
}
export function stepForIntake(field: IntakeField | null) {
  const id: PlannerQuestionId = field === "location" ? "city" : field === "vibe" ? "vibes" : field ?? "review";
  return plannerQuestions.findIndex((question) => question.id === id);
}
export function intakeQuestion(field: IntakeField | null) {
  const questions: Record<IntakeField, string> = {
    location: "Which city would you like your date to happen in? You can name a neighborhood too.",
    occasion: "What's the occasion — a first date, an anniversary, or a little just because?",
    people: "How many people are coming along?",
    vibe: "What kind of date sounds good: romantic, playful, relaxed, creative — or something else?",
    budget: "Do you have a comfortable spending ceiling? Give me a total or per-person amount, or say ‘keep it open’.",
    date: "Which actual day works for you? If it's a weekend, choose Saturday or Sunday.",
    time: "What starting time works? Morning, afternoon, evening, or an exact time — in the venue's local time.",
    duration: "How long do you have together, including travel? Tell me in hours, or choose a full day.",
  };
  return field ? questions[field] : "That's enough to choose one place. Check your preferences below, then tap ‘Find my date’ when you're ready.";
}

export function applyIntakeOutput(input: IntakeInput, output: unknown) {
  const parsed = intakeOutputSchema.safeParse(output);
  if (!parsed.success) return null;
  const patch = { ...parsed.data.patch };
  const answered = new Set(input.answered);
  let clarify: IntakeField | null = null;
  if (patch.budget !== undefined) {
    const amounts = input.message.match(/\d[\d,]*(?:\.\d+)?\s*k?/gi)?.map((value) => Number(value.replace(/[,k\s]/gi, "")) * (/k/i.test(value) ? 1000 : 1)) ?? [];
    const open = /\b(open|no budget|without a budget|skip|unset|remove.*budget|no spending limit)\b/i.test(input.message) && (input.nextField === "budget" || /\b(budget|spend|spending|limit)\b/i.test(input.message));
    if (patch.budget === null ? !open : !amounts.includes(patch.budget)) { delete patch.budget; clarify = "budget"; answered.delete("budget"); }
  }
  if (patch.date !== undefined) {
    const explicitDay = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d{4}-\d{2}-\d{2}|\b\d{1,2}[/-]\d{1,2}\b/i.test(input.message);
    if (!patch.date || patch.date < input.today || !explicitDay) { delete patch.date; clarify = "date"; answered.delete("date"); }
  }
  if (patch.startTime !== undefined && !/\b(morning|afternoon|evening|noon|midnight)\b|\b\d{1,2}(?::\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(input.message)) { delete patch.startTime; clarify = "time"; answered.delete("time"); }
  if (patch.duration !== undefined && !/\b(hours?|hrs?|minutes?|mins?|full day)\b|\d\s*h\b/i.test(input.message) && input.nextField !== "duration") delete patch.duration;
  if (patch.city !== undefined && patch.city !== input.request.city) {
    patch.area ??= patch.city;
    patch.locationScope ??= "city";
  }
  const dietary = patch.dietary && !/\b(remove|no longer|not needed|no restrictions)\b/i.test(input.message) ? [...new Set([...input.request.dietary, ...patch.dietary])] : patch.dietary ?? input.request.dietary;
  const next = requestSchema.safeParse({ ...input.request, ...patch, dietary,
    ...(patch.city ? { currentCity: patch.currentCity || input.request.currentCity || patch.city, startingArea: patch.city !== input.request.city ? "" : input.request.startingArea } : {}),
    ...(patch.area && patch.locationScope === undefined ? { locationScope: patch.area === (patch.city ?? input.request.city) ? "city" : "area" } : {}),
    ...(patch.startTime !== undefined && patch.startTime !== input.request.startTime && patch.endTime === undefined ? { endTime: "" } : {}),
    ...(patch.date ? { datePreference: [0, 6].includes(calendarDay(patch.date)) ? "weekend" : "weekday" } : {}),
  });
  if (!next.success) return null;
  if (patch.city) answered.add("location");
  if (patch.occasion) answered.add("occasion");
  if (patch.guests !== undefined) answered.add("people");
  if (patch.vibes?.length) answered.add("vibe");
  if (patch.budget !== undefined) answered.add("budget");
  if (patch.date) answered.add("date");
  if (patch.startTime) answered.add("time");
  if (patch.duration !== undefined) answered.add("duration");
  const confirmed = intakeFields.filter((field) => answered.has(field));
  const nextField = clarify ?? intakeNextField(next.data, confirmed, input.today);
  const acknowledgement = clarify ? "Let's pin down that detail before I change it." : /https?:|<[^>]*>|\?/.test(parsed.data.acknowledgement) ? "Thanks — that helps me understand your date." : parsed.data.acknowledgement;
  return { request: next.data, answered: confirmed, nextField, ready: nextField === null, message: `${acknowledgement}\n\n${intakeQuestion(nextField)}` };
}

export function intakeSummary(request: PlanRequest, answered: readonly IntakeField[]) {
  const budget = request.budget === null ? "Budget open" : new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(request.budget);
  const values: Record<IntakeField, string> = {
    location: request.area !== request.city ? `${request.area}, ${request.city}` : request.city,
    occasion: request.occasion, people: `${request.guests} people`, vibe: request.vibes.join(", "),
    budget: request.budget === null ? "Budget open" : `${budget} ${request.budgetType === "per-person" ? "per person" : "total"}`,
    date: request.date ? calendarLabel(request.date) : "Choose a day", time: request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time", duration: `${request.duration / 60} hours`,
  };
  return intakeFields.filter((field) => answered.includes(field)).map((field) => ({ field, value: values[field] }));
}
