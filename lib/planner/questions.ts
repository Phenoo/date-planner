import type { PlanRequest } from "./schema";

const originalQuestions = [
  {
    id: "city",
    title: "What city are you starting from?",
    description: "Tell us where you are. Next, we'll choose how far your date could take you.",
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
      "Set a comfortable amount, or keep your options open.",
    fields: ["budget", "budgetType", "includeFood", "includeTransport", "contingency"],
  },
  {
    id: "people",
    title: "Who's coming along?",
    description: "Just the two of you, or a little more company?",
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
    title: "Any little things we should consider?",
    description:
      "Food preferences, quieter places, or access needs. We'll keep them in mind.",
    fields: ["dietary", "quiet", "accessibility", "dislikes"],
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
    description: "Choose a starting time. We'll check the venue's local opening hours.",
    fields: ["startTime"],
  },
  {
    id: "duration",
    title: "How much time do you have together?",
    description:
      "We'll leave room for getting there, settling in, and enjoying the moment.",
    fields: ["duration", "endTime", "environment", "flexible"],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  description: string;
  fields: readonly (keyof PlanRequest)[];
}[];


const originalOrder = [...originalQuestions.map(({ id }) => id), "notes"] as const;
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
const order = ["yourGender", "dateGender", "city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "duration", "review"] as const;
export type PlannerQuestionId = typeof order[number];
export const plannerQuestions: readonly { id: PlannerQuestionId; title: string; description: string; fields: readonly (keyof PlanRequest)[] }[] = order.map((id) => {
  if (id === "review") return { id, title: "Everything looks good?", description: "One last look. Every detail is yours to change.", fields: [] };
  const question = originalQuestions.find((item) => item.id === id) ?? genderQuestions.find((item) => item.id === id)!;
  const titles: Record<string, string> = { occasion: "What's the special occasion?", vibes: "What kind of date are you feeling?", interests: "What makes a date special for you?", duration: "How long are we going out?" };
  return { ...question, title: titles[id] || question.title };
});
export const plannerQuestionCount = plannerQuestions.length;
export const plannerDraftVersion = 12;
export function restorePlannerStep(step: unknown, version: unknown): number {
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0) return 0;
  if (version === plannerDraftVersion) return Math.min(plannerQuestionCount - 1, step);
  if (version === 11) return order.indexOf(versionElevenOrder[Math.min(versionElevenOrder.length - 1, step)]);
  if (version === 10) return order.indexOf(versionTenOrder[Math.min(versionTenOrder.length - 1, step)]);
  if (version === 8 || version === 9) return order.indexOf(versionNineOrder[Math.min(versionNineOrder.length - 1, step)]);
  if (version === 7) return order.indexOf(versionSevenOrder[Math.min(versionSevenOrder.length - 1, step)]);
  if (version === 5 || version === 6) {
    const source = version === 6 ? versionSixOrder : previousOrder;
    const id = source[Math.min(source.length - 1, step)];
    return order.indexOf(id === "intro" ? "city" : id === "notes" ? "interests" : id);
  }
  const originalIndex = version === 3 ? [0, 2, 3, 5, 6, 8, 11][Math.min(6, step)] ?? 0 : Math.min(originalOrder.length - 1, step);
  if (version === 3 || version === 4 || version === 2 || version === undefined) {
    const id = originalOrder[originalIndex];
    return order.indexOf(id === "notes" ? "interests" : id);
  }
  return 0;
}
