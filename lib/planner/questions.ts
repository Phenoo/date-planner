import type { PlanRequest } from "./schema";

const originalQuestions = [
  {
    id: "city",
    title: "What city are you starting from?",
    description: "Choose your city. Next, we’ll work out where you’d like to go.",
    fields: ["country", "city", "currentCity"],
  },
  {
    id: "area",
    title: "How far should we take this?",
    description:
      "Your date doesn't have to stay close to home. Open up the possibilities, or choose a place you have in mind.",
    fields: [
      "area",
      "city",
      "locationScope",
      "startingArea",
      "maxDistance",
      "transport",
      "meetingTogether",
    ],
  },
  {
    id: "occasion",
    title: "What's bringing you two together?",
    description: "The first date. The fiftieth. The just because.",
    fields: ["occasion"],
  },
  {
    id: "budget",
    title: "Do you have a budget in mind?",
    description:
      "Choose an amount that feels comfortable. We’ll keep that limit, or you can leave it open.",
    fields: ["budget", "currency", "budgetType", "transportBudget", "includeFood", "includeTransport", "contingency"],
  },
  {
    id: "people",
    title: "Who's coming along?",
    description: "Just you, two of you, or a few more? Tell us how many people to plan for.",
    fields: [
      "guests",
    ],
  },
  {
    id: "vibes",
    title: "What's your kind of date?",
    description: "Pick a few that feel like you. You can choose more than one.",
    fields: ["vibes"],
  },
  {
    id: "interests",
    title: "What would make them smile?",
    description:
      "Tell us a little about the things they love. This part is optional.",
    fields: ["interests", "notes", "surprises"],
  },
  {
    id: "requirements",
    title: "What should your place be like?",
    description:
      "Choose the setting and noise level that work for you, and tell us about access needs or places to avoid. These preferences guide our search.",
    fields: ["quiet", "accessibility", "dislikes", "environment", "dietary"],
  },
  {
    id: "date",
    title: "When are we making this happen?",
    description: "Pick the day that works best for you.",
    fields: ["date", "datePreference"],
  },
  {
    id: "time",
    title: "What time works best?",
    description: "Pick a time that works for you. We’ll check it against the venue’s opening hours.",
    fields: ["startTime"],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  description: string;
  fields: readonly (keyof PlanRequest)[];
}[];


const originalOrder = ["city", "area", "occasion", "budget", "people", "vibes", "interests", "requirements", "date", "time", "duration", "notes"] as const;
const genderQuestions = [
  { id: "yourGender", title: "What's your gender?", description: "This is optional. Choose what feels right for you.", fields: ["yourGender"] },
  { id: "dateGender", title: "And your date's gender?", description: "Choose what they've shared with you, or leave this open.", fields: ["dateGender"] },
] as const;
const previousOrder = ["intro", "city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "duration", "notes", "review"] as const;
const versionSixOrder = previousOrder.filter((id) => id !== "notes");
const versionSevenOrder = previousOrder.filter((id) => id !== "notes" && id !== "intro");
const versionNineOrder = ["city", "area", "occasion", "people", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"] as const;
const versionTenOrder = ["city", "area", "occasion", "people", "yourGender", "dateGender", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"] as const;
const versionElevenOrder = ["yourGender", "dateGender", "city", "area", "occasion", "people", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"] as const;
const versionTwelveOrder = ["yourGender", "dateGender", "city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "duration", "review"] as const;
const order = ["yourGender", "dateGender", "city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "review"] as const;
export type PlannerQuestionId = typeof order[number];
export const plannerQuestions: readonly { id: PlannerQuestionId; title: string; description: string; fields: readonly (keyof PlanRequest)[] }[] = order.map((id) => {
  if (id === "review") return { id, title: "Does this look right?", description: "Take a quick look. You can change any answer before we find your date.", fields: [] };
  const question = originalQuestions.find((item) => item.id === id) ?? genderQuestions.find((item) => item.id === id)!;
  const titles: Record<string, string> = { occasion: "What's the special occasion?", vibes: "What kind of date are you feeling?", interests: "What makes a date special for you?" };
  return { ...question, title: titles[id] || question.title };
});
export const plannerQuestionCount = plannerQuestions.length;
export const plannerDraftVersion = 13;
function currentStep(id: string) {
  const mapped = id === "duration" ? "review" : id === "notes" ? "interests" : id === "intro" ? "city" : id;
  const index = plannerQuestions.findIndex(question => question.id === mapped);
  return Math.max(0, index);
}
export function restorePlannerStep(step: unknown, version: unknown, questionId?: unknown): number {
  if (questionId === "duration") return currentStep("review");
  const semanticStep = plannerQuestions.findIndex((question) => question.id === questionId);
  if (semanticStep >= 0) return semanticStep;
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0) return 0;
  if (version === plannerDraftVersion) return Math.min(plannerQuestionCount - 1, step);
  if (version === 12) return currentStep(versionTwelveOrder[Math.min(versionTwelveOrder.length - 1, step)]);
  if (version === 11) return currentStep(versionElevenOrder[Math.min(versionElevenOrder.length - 1, step)]);
  if (version === 10) return currentStep(versionTenOrder[Math.min(versionTenOrder.length - 1, step)]);
  if (version === 8 || version === 9) return currentStep(versionNineOrder[Math.min(versionNineOrder.length - 1, step)]);
  if (version === 7) return currentStep(versionSevenOrder[Math.min(versionSevenOrder.length - 1, step)]);
  if (version === 5 || version === 6) {
    const source = version === 6 ? versionSixOrder : previousOrder;
    return currentStep(source[Math.min(source.length - 1, step)]);
  }
  const originalIndex = version === 3 ? [0, 2, 3, 5, 6, 8, 11][Math.min(6, step)] ?? 0 : Math.min(originalOrder.length - 1, step);
  if (version === 3 || version === 4 || version === 2 || version === undefined) return currentStep(originalOrder[originalIndex]);
  return 0;
}
