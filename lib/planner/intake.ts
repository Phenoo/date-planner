import { z } from "zod";
import { requestSchema, type PlanRequest } from "./schema";
import { plannerQuestions, quickPlannerQuestionIds, type PlannerQuestionId } from "./questions";
import { calendarDay, calendarLabel, clockLabel, zonedNow, scheduleError, timeMinutes } from "./schedule";
import { explicitSpendingAmounts, explicitClockTimes, normalizeClockPunctuation, spokenClockReply } from "./spoken-values";
import { explicitLagosNeighborhood } from "./intake-location";
import { amountPrecisionError, currencyForCountry, formatMoney } from "./currency";
import { ambiguousBudgetCurrency, explicitIntakeCorrection, intakeEditField } from "./intake-corrections";

export const intakeFields = ["location", "occasion", "people", "vibe", "budget", "date", "time"] as const;
export type IntakeField = typeof intakeFields[number];
export type PlannerMode = "chat" | "steps";
const fieldSchema = z.enum([...intakeFields, "duration"]);
const answeredSchema = z.array(fieldSchema).max(8).transform(fields => fields.filter((field): field is IntakeField => field !== "duration"));
const nextFieldSchema = fieldSchema.nullable().transform(field => field === "duration" ? null : field);
export const chatMessageSchema = z.object({ id: z.string().max(80), role: z.enum(["user", "assistant"]), text: z.string().min(1).max(1600) });
export const chatSessionSchema = z.object({ messages: z.array(chatMessageSchema).max(24), answered: answeredSchema, nextField: nextFieldSchema });
export type ChatSession = z.infer<typeof chatSessionSchema>;
export const emptyChatSession = (): ChatSession => ({ messages: [], answered: [], nextField: "location" });
export const intakeInputSchema = z.object({
  request: requestSchema, message: z.string().trim().min(1).max(1200), today: z.iso.date(),
  answered: answeredSchema, nextField: nextFieldSchema,
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(800) })).max(6).default([]),
});
export type IntakeInput = z.infer<typeof intakeInputSchema>;
const shape = requestSchema.shape;
const patchSchema = z.object({
  country: shape.country.unwrap().optional(), city: shape.city.optional(), currentCity: shape.currentCity.unwrap().optional(), area: shape.area.optional(), locationScope: shape.locationScope.unwrap().optional(),
  maxDistance: shape.maxDistance.unwrap().optional(), meetingTogether: shape.meetingTogether.unwrap().optional(), transport: shape.transport.unwrap().optional(),
  occasion: shape.occasion.optional(), budget: shape.budget.optional(), budgetType: shape.budgetType.unwrap().optional(), guests: shape.guests.unwrap().optional(),
  currency: shape.currency.unwrap().optional(), transportBudget: shape.transportBudget.unwrap().optional(), timeZone: shape.timeZone.unwrap().optional(),
  includeTransport: shape.includeTransport.unwrap().optional(), includeFood: shape.includeFood.unwrap().optional(), contingency: shape.contingency.unwrap().optional(),
  vibes: shape.vibes.optional(), interests: shape.interests.unwrap().optional(), dislikes: shape.dislikes.unwrap().optional(), dietary: shape.dietary.unwrap().optional(),
  accessibility: shape.accessibility.unwrap().optional(), quiet: shape.quiet.unwrap().optional(), surprises: shape.surprises.unwrap().optional(),
  date: shape.date.unwrap().optional(), startTime: shape.startTime.unwrap().optional(),
  environment: shape.environment.unwrap().optional(), flexible: shape.flexible.unwrap().optional(), notes: shape.notes.unwrap().optional(), avoidRestaurants: shape.avoidRestaurants.unwrap().optional(),
});
export const intakeOutputSchema = z.object({ acknowledgement: z.string().trim().min(3).max(240), patch: patchSchema });
export const intakeReplySchema = z.object({ request: requestSchema, answered: answeredSchema, nextField: nextFieldSchema, ready: z.boolean(), message: z.string().max(1000) });

const questionFields: Partial<Record<PlannerQuestionId, IntakeField>> = { city: "location", area: "location", occasion: "occasion", people: "people", vibes: "vibe", budget: "budget", date: "date", time: "time" };
export function intakeFieldForQuestion(id: PlannerQuestionId) { return questionFields[id]; }
export function wizardQuestionSteps(request: PlanRequest, answered: readonly IntakeField[], today = zonedNow(request.timeZone).date) {
  const valid = requestSchema.safeParse(request);
  return plannerQuestions.flatMap((question, index) => {
    if (!quickPlannerQuestionIds.some(id => id === question.id)) return [];
    const field = questionFields[question.id];
    if (question.id === "date" && (!answered.includes("date") || !answered.includes("time") || !request.date || request.date < today || !request.startTime || scheduleError({ ...request, timeZoneConfirmed: true, endTime: "" }, today))) return [index];
    if (!field || !answered.includes(field)) return [index];
    if (!valid.success && valid.error.issues.some((issue) => question.fields.some((key) => key === issue.path[0]))) return [index];
    return [];
  });
}
export function answeredThroughStep(step: number): IntakeField[] {
  return [...new Set(plannerQuestions.slice(0, step).flatMap(({ id }) => questionFields[id] ? [questionFields[id]!] : []))];
}
export function intakeNextField(request: PlanRequest, answered: readonly IntakeField[], today = zonedNow(request.timeZone).date): IntakeField | null {
  const missing = intakeFields.find((field) => !answered.includes(field));
  if (missing) return missing;
  if (!request.date || request.date < today) return "date";
  const current = zonedNow(request.timeZone);
  if (!request.startTime || today === current.date && request.date === current.date && request.startTime <= current.time) return "time";
  if (scheduleError({ ...request, timeZoneConfirmed: true, endTime: "" }, today)) return "time";
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
    time: "What time would you like to start? Pick a time below, or tell me one, like 7:45 PM.",
  };
  return field ? questions[field] : "I’ve got your details. Tap ‘Reveal my date’ to find your place, or tell me what you’d like to change.";
}

export function intakeTimeReply(input: IntakeInput, now = new Date()) {
  if (input.nextField !== "time" && input.nextField !== null && !/^start(?:ing)?\b/i.test(input.message.trim())) return null;
  const match = normalizeClockPunctuation(input.message).match(/^(?:start(?:ing)?(?: the date)?(?: at)?\s+|at\s+)?(\d{1,2})(?:[:.]([0-5]\d))?\s*(am|pm)?[.!]?$/i);
  let startTime = spokenClockReply(input.message);
  if (match && (match[2] || match[3])) {
    const hour = Number(match[1]);
    const period = match[3]?.toLowerCase();
    if (period ? hour < 1 || hour > 12 : hour > 23) return null;
    startTime = `${String(period ? hour % 12 + (period === "pm" ? 12 : 0) : hour).padStart(2, "0")}:${match[2] ?? "00"}`;
  }
  if (!startTime) return null;
  const current = zonedNow(input.request.timeZone, now);
  if (input.request.date && (input.request.date < current.date || input.request.date === current.date && startTime <= current.time)) {
    return { request: input.request, answered: input.answered, nextField: input.request.date < current.date ? "date" as const : "time" as const, ready: false, message: input.request.date < current.date ? "Choose today or a future date, then we can set the time." : "That time has already passed. Choose a later time for your date." };
  }
  return applyIntakeOutput({ ...input, message: `Start at ${startTime}.` }, { acknowledgement: `We'll start at ${clockLabel(timeMinutes(startTime))}.`, patch: { startTime } });
}

export function applyIntakeOutput(input: IntakeInput, output: unknown) {
  const parsed = intakeOutputSchema.safeParse(output);
  if (!parsed.success) return null;
  if (ambiguousBudgetCurrency(input)) return { request: input.request, answered: input.answered, nextField: "budget" as const, ready: false, message: "Which currency do you mean? Please include its code, such as USD or CAD. Your current spending limit and other answers are kept." };
  const direct = explicitIntakeCorrection(input);
  const patch: z.infer<typeof patchSchema> = { ...(direct?.patch ?? parsed.data.patch) };
  if (input.nextField === "occasion") {
    const reply = input.message.trim().toLowerCase();
    if (reply === "a first date") patch.occasion = "First date";
    else if (reply === "our anniversary") patch.occasion = "Anniversary";
    else if (reply === "just because") patch.occasion = "Just because";
  }
  if (!patch.city && /^(?:nigeria|ng)$/i.test((patch.country ?? input.request.country).trim())) {
    const area = explicitLagosNeighborhood(input.message, patch.area, input.nextField === "location");
    if (area) { patch.city = "Lagos"; patch.country = "Nigeria"; patch.area = area; patch.locationScope = "area"; }
  }
  const answered = new Set(input.answered);
  let clarify: IntakeField | null = intakeEditField(input.message);
  if (clarify) answered.delete(clarify);
  const destinationMoney = patch.country && patch.country !== input.request.country ? currencyForCountry(patch.country) : null;
  if (destinationMoney && patch.currency === undefined) patch.currency = destinationMoney;
  const resetBudget = patch.currency !== undefined && patch.currency !== input.request.currency && patch.budget === undefined;
  if (resetBudget) { patch.budget = null; patch.transportBudget = null; answered.delete("budget"); }
  if (patch.budget !== undefined && !resetBudget) {
    const amounts = explicitSpendingAmounts(input.message, input.nextField === "budget");
    const open = /\b(open|no budget|without a budget|skip|unset|remove.*budget|no spending limit)\b/i.test(input.message) && (input.nextField === "budget" || /\b(budget|spend|spending|limit)\b/i.test(input.message));
    if (patch.budget === null ? !open : !amounts.includes(patch.budget)) { delete patch.budget; clarify = "budget"; answered.delete("budget"); }
  }
  if (patch.budget !== undefined && amountPrecisionError(patch.budget, patch.currency ?? input.request.currency)) { delete patch.budget; clarify = "budget"; answered.delete("budget"); }
  if (patch.date !== undefined) {
    const explicitDay = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d{4}-\d{2}-\d{2}|\b\d{1,2}[/-]\d{1,2}\b/i.test(input.message);
    if (!patch.date || patch.date < input.today || !explicitDay) { delete patch.date; clarify = "date"; answered.delete("date"); }
  }
  if (patch.startTime !== undefined && !explicitClockTimes(input.message).includes(patch.startTime)) {
    delete patch.startTime;
    if (input.nextField === "time" || !answered.has("time") || explicitClockTimes(input.message).length) { clarify = "time"; answered.delete("time"); }
  }

  if (patch.city !== undefined && patch.city !== input.request.city) {
    patch.area ??= patch.city;
    patch.locationScope ??= "city";
  }
  const dietary = patch.dietary && !/\b(remove|no longer|not needed|no restrictions)\b/i.test(input.message) ? [...new Set([...input.request.dietary, ...patch.dietary])] : patch.dietary ?? input.request.dietary;
  const next = requestSchema.safeParse({ ...input.request, ...patch, dietary,
    ...((patch.city && patch.city !== input.request.city || patch.country && patch.country !== input.request.country) ? { timeZoneConfirmed: false } : {}),
    ...(patch.city ? { currentCity: patch.currentCity || input.request.currentCity || patch.city, startingArea: patch.city !== input.request.city ? "" : input.request.startingArea } : {}),
    ...(patch.area && patch.locationScope === undefined ? { locationScope: patch.area === (patch.city ?? input.request.city) ? "city" : "area" } : {}),
    ...(patch.startTime !== undefined && patch.startTime !== input.request.startTime ? { endTime: "" } : {}),
    ...(patch.date ? { datePreference: [0, 6].includes(calendarDay(patch.date)) ? "weekend" : "weekday" } : {}),
  });
  if (!next.success) return null;
  if (patch.city) answered.add("location");
  if (patch.occasion) answered.add("occasion");
  if (patch.guests !== undefined) answered.add("people");
  if (patch.vibes?.length) answered.add("vibe");
  if (patch.budget !== undefined && !resetBudget) answered.add("budget");
  if (patch.date) answered.add("date");
  if (patch.startTime) answered.add("time");
  const confirmed = intakeFields.filter((field) => answered.has(field));
  const nextField = clarify ?? intakeNextField(next.data, confirmed, input.today);
  const acknowledgement = resetBudget ? `The destination uses ${patch.currency}. Your other details are kept; please confirm a new spending limit rather than converting your previous amount.` : clarify ? "Let's pin down that detail before I change it." : direct?.acknowledgement ?? (/https?:|<[^>]*>|\?/.test(parsed.data.acknowledgement) ? "Thanks — that helps me understand your date." : parsed.data.acknowledgement);
  return { request: next.data, answered: confirmed, nextField, ready: nextField === null, message: `${acknowledgement}\n\n${intakeQuestion(nextField)}` };
}

export function intakeSummary(request: PlanRequest, answered: readonly IntakeField[]) {
  const budget = request.budget === null ? "Budget open" : formatMoney(request.budget, request.currency);
  const values: Record<IntakeField, string> = {
    location: request.area !== request.city ? `${request.area}, ${request.city}` : request.city,
    occasion: request.occasion, people: `${request.guests} people`, vibe: request.vibes.join(", "),
    budget: request.budget === null ? "Budget open" : `${budget} ${request.budgetType === "per-person" ? "per person" : "total"}`,
    date: request.date ? calendarLabel(request.date) : "Choose a day", time: request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time",
  };
  return intakeFields.filter((field) => answered.includes(field)).map((field) => ({ field, value: values[field] }));
}
