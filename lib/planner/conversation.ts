import { z } from "zod";
import { genderOptions, occasions, vibes, type PlanRequest } from "./schema";
import { plannerQuestions } from "./questions";

export const conversationSteps = ["yourGender", "dateGender", "city", "area", "occasion", "people", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"] as const;
export type ConversationStep = typeof conversationSteps[number];
export const conversationInputSchema = z.object({
  step: z.enum(conversationSteps),
  context: z.object({
    city: z.string().max(80), occasion: z.string().max(100), budget: z.number().min(1000).max(10000000).nullable(),
    guests: z.number().int().min(1).max(12).nullable(), vibes: z.array(z.enum(vibes)).max(12),
    interests: z.string().max(240), day: z.enum(["weekday", "weekend"]).nullable(), time: z.string().max(5), duration: z.number().min(60).max(720).nullable(),
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
    guests: answered("people") ? request.guests : null,
    vibes: answered("vibes") ? request.vibes : [],
    interests: answered("interests") ? request.interests.slice(0, 240) : "",
    day: answered("date") ? request.datePreference : null,
    time: answered("time") ? request.startTime : "",
    duration: answered("duration") ? request.duration : null,
  } };
}
export function conversationChoices(step: ConversationStep): { key: string; label: string }[] {
  if (step === "yourGender" || step === "dateGender") return genderOptions.map(({ value, label }) => ({ key: value || "open", label }));
  if (step === "occasion") return occasions.map((label) => ({ key: label, label }));
  if (step === "vibes") return vibes.map((label) => ({ key: label, label }));
  if (step === "budget") return [{ key: "yes", label: "Set a budget" }, { key: "no", label: "Keep the budget open" }];
  if (step === "date") return [{ key: "weekday", label: "Weekday" }, { key: "weekend", label: "Weekend" }];
  if (step === "time") return [{ key: "open", label: "Decide together" }, { key: "15:00", label: "3 PM" }, { key: "18:00", label: "6 PM" }];
  if (step === "people") return [2, 4, 6].map((value) => ({ key: String(value), label: `${value} people` }));
  if (step === "duration") return [90, 120, 180, 240, 300, 360, 480, 720].map((value) => ({ key: String(value), label: `${value / 60} hours` }));
  return [{ key: "continue", label: "Continue with these details" }];
}
export function conversationAnswerKey(step: ConversationStep, request: PlanRequest): string {
  if (step === "yourGender" || step === "dateGender") return request[step] || "open";
  if (step === "occasion") return request.occasion;
  if (step === "budget") return request.budget === null ? "no" : "yes";
  if (step === "people") return String(request.guests);
  if (step === "date") return request.datePreference;
  if (step === "time") return request.startTime || "open";
  if (step === "duration") return String(request.duration);
  return "continue";
}
export function localReaction(step: ConversationStep, request: PlanRequest): string {
  const reactions: Record<ConversationStep, string[]> = {
    yourGender: ["Lovely. Let's meet the other half of this plan.", "That's you. Let's meet your date."],
    dateGender: ["Introductions, done. Let's set the scene.", "You two, noted. Now for a change of scenery."],
    city: [`${request.currentCity || request.city}, let's see what you've got.`, "A starting point. The possibilities come next."],
    area: ["A little room to explore. I like it.", "A new backdrop for your next good story."],
    occasion: ["That deserves a little thought. I'm on it.", "A good reason to make a little effort."],
    people: [request.guests === 2 ? "A table for two. Figuratively, for now." : "More company, more stories. Got it.", "The guest list is looking good."],
    budget: [request.budget === null ? "Options open. We'll leave the spending decisions to you." : "Comfort first. That's our spending ceiling.", "Good memories don't need an awkward bill."],
    vibes: ["Now we're finding your kind of fun.", "That adds a little personality to the plan.", "A little more you. Keep going."],
    interests: ["It's the little details that do the heavy lifting.", "A thoughtful touch. Those are the best kind."],
    requirements: ["Comfort belongs in the plan too. Noted.", "The little things matter. I've got them."],
    date: [request.datePreference === "weekend" ? "A weekend with a little main-character energy." : "A little plot twist for an ordinary weekday.", "A good day to make time for each other."],
    time: [request.startTime ? "A little time set aside for something good." : "A little mystery in the timing. You can decide together.", "No rush. This is your time."],
    duration: ["Room for the date, and a little getting-lost-in-conversation time.", "Time for the good part: bringing it all together."],
    review: ["The little details are all here. Let's make a plan."],
  };
  const options = reactions[step];
  return options[Math.floor(Math.random() * options.length)];
}
export function fallbackConversation(input: ConversationInput): ConversationReply {
  return { step: input.step, ai: false, prompt: plannerQuestions.find(({ id }) => id === input.step)?.description ?? "Let's make this your kind of date.", responses: conversationChoices(input.step).map(({ key }) => ({ key, line: "A little more you. Let's keep going." })) };
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
