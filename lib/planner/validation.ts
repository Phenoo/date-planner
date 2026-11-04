import { amountPrecisionError } from "./currency";
import { plannerQuestions, type PlannerQuestionId } from "./questions";
import { requestSchema, type PlanRequest } from "./schema";
import { scheduleError, validTimeZone, zonedNow } from "./schedule";

const messages: Partial<Record<PlannerQuestionId, string>> = {
  city: "Enter a city and country with at least two characters.",
  area: "Choose a destination and a search reach between 1 and 100 km.",
  occasion: "Choose an occasion for your date.",
  budget: "Enter an amount between 0 and 10,000,000 in your selected currency, or keep it open.",
  people: "Choose a whole number of people between 1 and 12.",
  vibes: "Choose at least one date vibe.",
  date: "Choose a valid day for your date.",
  time: "Choose a valid starting time.",
};
export type PlannerValidationIssue = { question: PlannerQuestionId; message: string };
export function plannerValidationIssues(request: PlanRequest, now = new Date()): PlannerValidationIssue[] {
  const issues = new Map<PlannerQuestionId, string>();
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const question = plannerQuestions.find(({ fields }) => fields.some((field) => field === issue.path[0]))?.id ?? "review";
    if (!issues.has(question)) issues.set(question, messages[question] ?? issue.message);
  }
  const amountError = amountPrecisionError(request.budget, request.currency) || amountPrecisionError(request.transportBudget, request.currency);
  if (amountError) issues.set("budget", amountError);
  if (!validTimeZone(request.timeZone)) return [...issues].map(([question, message]) => ({ question, message }));
  const current = zonedNow(request.timeZone, now);
  if (!issues.has("date") && (!request.date || request.date < current.date)) issues.set("date", "Choose today or a future day for your date.");
  if (!issues.has("time") && (!request.startTime || request.date === current.date && request.startTime <= current.time)) issues.set("time", request.startTime ? "That time has already passed. Choose a later starting time." : "Choose a starting time for your date.");
  if (!issues.has("date") && !issues.has("time")) {
    const error = scheduleError({ ...request, timeZoneConfirmed: true, endTime: "" }, undefined, now);
    if (error) {
      issues.set("time", error);
    }
  }
  return [...issues].map(([question, message]) => ({ question, message }));
}
