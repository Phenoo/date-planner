import { z } from "zod";
import { genderOptions, occasions, vibes, type PlanRequest } from "./schema";
import { plannerQuestions } from "./questions";

export const conversationSteps = ["yourGender", "dateGender", "city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "review"] as const;
export type ConversationStep = typeof conversationSteps[number];
export const conversationInputSchema = z.object({
  step: z.enum(conversationSteps),
  context: z.object({
    city: z.string().max(80), occasion: z.string().max(100), budget: z.number().min(0).max(10000000).nullable(), currency: z.string().length(3).default("NGN"),
    guests: z.number().int().min(1).max(12).nullable(), vibes: z.array(z.enum(vibes)).max(12),
    interests: z.string().max(240), day: z.enum(["weekday", "weekend"]).nullable(), time: z.string().max(5), duration: z.number().min(60).max(720).nullable().default(null),
  }).strict(),
}).strict();
export type ConversationInput = z.infer<typeof conversationInputSchema>;
export const conversationCopySchema = z.object({
  prompt: z.string().trim().min(5).max(180),
  responses: z.array(z.object({ key: z.string().max(100), line: z.string().trim().min(3).max(120) })).min(1).max(12),
});
export const conversationReplySchema = conversationCopySchema.extend({ step: z.enum(conversationSteps), ai: z.boolean() });
export type ConversationReply = z.infer<typeof conversationReplySchema>;

export function conversationInput(step: ConversationStep, request: PlanRequest): ConversationInput {
  const index = plannerQuestions.findIndex(({ id }) => id === step);
  const answered = (id: ConversationStep) => plannerQuestions.findIndex((question) => question.id === id) < index;
  return { step, context: {
    city: answered("area") ? request.city : answered("city") ? request.currentCity || request.city : "",
    occasion: answered("occasion") ? request.occasion : "",
    budget: answered("budget") ? request.budget : null,
    currency: request.currency,
    guests: answered("people") ? request.guests : null,
    vibes: answered("vibes") ? request.vibes : [],
    interests: answered("interests") ? request.interests.slice(0, 240) : "",
    day: answered("date") ? request.datePreference : null,
    time: answered("time") ? request.startTime : "",
    duration: null,
  } };
}
export function conversationChoices(step: ConversationStep): { key: string; label: string }[] {
  if (step === "yourGender" || step === "dateGender") return genderOptions.map(({ value, label }) => ({ key: value || "open", label }));
  if (step === "occasion") return occasions.map((label) => ({ key: label, label }));
  if (step === "vibes") return vibes.map((label) => ({ key: label, label }));
  if (step === "budget") return [{ key: "yes", label: "Set a budget" }, { key: "no", label: "Keep the budget open" }];
  if (step === "date") return [{ key: "weekday", label: "Weekday" }, { key: "weekend", label: "Weekend" }];
  if (step === "time") return [{ key: "continue", label: "Choose your start time" }];
  if (step === "people") return [2, 4, 6].map((value) => ({ key: String(value), label: `${value} people` }));
  return [{ key: "continue", label: "Continue with these details" }];
}
export function conversationAnswerKey(step: ConversationStep, request: PlanRequest): string {
  if (step === "yourGender" || step === "dateGender") return request[step] || "open";
  if (step === "occasion") return request.occasion;
  if (step === "budget") return request.budget === null ? "no" : "yes";
  if (step === "people") return String(request.guests);
  if (step === "date") return request.datePreference;
  if (step === "time") return request.startTime || "open";
  return "continue";
}
export function localReaction(step: ConversationStep, request: PlanRequest): string {
  const reactions: Record<ConversationStep, string[]> = {
    yourGender: ["Thanks. This part is optional.", "Got it. Share only what you’re comfortable with."],
    dateGender: ["Thanks. Let’s choose where you’d like to go.", "Got it. Let’s talk about the date."],
    city: [`Starting from ${request.currentCity || request.city}. Let’s choose where to go.`, "Got it. Let’s choose a destination."],
    area: ["We’ll look around your chosen destination.", "That gives us a place to start."],
    occasion: ["We’ll keep the occasion in mind.", "Got it. Let’s make it feel right for the occasion."],
    people: [`${request.guests === 1 ? "One person" : `${request.guests} people`}. Got it.`, "We’ll plan for everyone coming along."],
    budget: [request.budget === null ? "No spending limit set. We’ll show costs where available." : "That’s the spending limit we’ll work with.", "Got it. We’ll keep your budget choice in place."],
    vibes: ["I’m getting a feel for what you’d enjoy.", "We’ll use that to guide the search."],
    interests: ["Thanks. Those details help make this yours.", "Got it. We’ll keep those interests in mind."],
    requirements: ["Noted. We’ll keep those needs in place.", "Your comfort matters. We’ll use what you’ve told us."],
    date: ["That day is noted.", "Got it. Let’s work out the timing."],
    time: [request.startTime ? "That start time is noted." : "We’ll choose a time before searching.", "We’ll check the time against the venue’s hours."],
    review: ["Your details are here. We’re ready to look for a match."],
  };
  const options = reactions[step];
  return options[Math.floor(Math.random() * options.length)];
}
export function fallbackConversation(input: ConversationInput): ConversationReply {
  return { step: input.step, ai: false, prompt: plannerQuestions.find(({ id }) => id === input.step)?.description ?? "Let’s find a date that suits you.", responses: conversationChoices(input.step).map(({ key }) => ({ key, line: "Got it. Let’s keep going." })) };
}
export function validateConversationCopy(input: ConversationInput, output: unknown) {
  const parsed = conversationCopySchema.safeParse(output);
  if (!parsed.success) return null;
  const allowed = new Set(conversationChoices(input.step).map(({ key }) => key));
  const keys = new Set(parsed.data.responses.map(({ key }) => key));
  if (keys.size !== allowed.size || keys.size !== parsed.data.responses.length || [...keys].some((key) => !allowed.has(key))) return null;
  if (parsed.data.responses.some(({ line }) => line.includes("?"))) return null;
  if ([parsed.data.prompt, ...parsed.data.responses.map(({ line }) => line)].some((line) => /https?:|<[^>]*>|\*\*|\n/.test(line))) return null;
  const lines = [parsed.data.prompt, ...parsed.data.responses.map(({ line }) => line)];
  if (lines.some((line) => /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(line))) return null;
  const assumedTime = /\b(morning|afternoon|evening|tonight|sunset|sunrise|midnight)\b/i;
  if (!input.context.time && (assumedTime.test(parsed.data.prompt) || (input.step !== "time" && lines.some((line) => assumedTime.test(line))))) return null;
  if ((input.step === "yourGender" || input.step === "dateGender") && [parsed.data.prompt, ...parsed.data.responses.map(({ line }) => line)].some((line) => /\b(she|her|he|him|his|woman|women|man|men|feminine|masculine|girlfriend|boyfriend)\b/i.test(line))) return null;
  return parsed.data;
}
