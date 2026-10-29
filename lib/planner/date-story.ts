import { z } from "zod";
import { calendarLabel } from "./schedule";

export const dateStorySchema = z.object({
  title: z.string().trim().min(3).max(90),
  introduction: z.string().trim().min(5).max(300),
  moments: z.array(z.object({ title: z.string().trim().min(2).max(60), text: z.string().trim().min(5).max(300) })).min(2).max(3),
  ending: z.string().trim().min(5).max(200),
});
export type DateStory = z.infer<typeof dateStorySchema>;

export function dateStoryIntroduction(preferences: { datePreference: "weekday" | "weekend"; vibes: readonly string[] }) {
  const moods: Record<string, string> = { Romantic: "a little romance", Adventurous: "a shared sense of adventure", Relaxed: "an unhurried moment together", Playful: "some easy laughter", Luxurious: "a little extra thought", Creative: "a spark of creativity", "Food & dining": "your shared tastes", Outdoors: "a little curiosity", Entertainment: "a playful change of pace", Private: "time focused on each other", Active: "a shared burst of energy", Unexpected: "a welcome surprise" };
  const mood = preferences.vibes.flatMap((vibe) => moods[vibe] ? [moods[vibe]] : []).slice(0, 2).join(" and ") || "a little curiosity";
  return `Imagine a ${preferences.datePreference} with ${mood}. Start with curiosity, leave room for laughter, and enjoy discovering a little more about each other.`;
}

export function fallbackDateStory(category: string): DateStory {
  const creative = /\b(?:arts?|galler(?:y|ies)|museums?|pottery|ceramics?|studio)\b/i.test(category);
  const outdoors = /park|garden|beach|nature/i.test(category);
  const food = /restaurant|cafe|dining|bar/i.test(category);
  return {
    title: creative ? "A little creativity. A little chemistry." : outdoors ? "Take the slow way, together." : food ? "A table, a conversation, a little chemistry." : "Your next little adventure together.",
    introduction: "Imagine arriving with no pressure to make everything perfect. Just a little curiosity, good company, and time that belongs to the two of you.",
    moments: [
      { title: "Start with an easy hello", text: "Put your phones away for a moment. Ask what made them smile this week, and let the conversation find its own pace." },
      { title: creative ? "See it through their eyes" : outdoors ? "Let curiosity lead" : food ? "Make a little game of it" : "Try a little something new", text: creative ? "Take turns choosing something that catches your eye. Guess what the other person likes about it, then hear their version of the story. Ask the venue what activities are available if you would like to make something together." : outdoors ? "Look for a detail the other person might have missed. Make up a tiny story about it, or trade your favourite memories of being outdoors." : food ? "Ask each other what you would order for the other person, then compare notes. Check the menu and any dietary needs together before choosing." : "Each choose one small thing to explore or try, if available. The fun is discovering a different side of each other, without needing to be good at anything." },
      { title: "Leave with a little keepsake", text: "Before you leave, each share your favourite moment. Take a photo together if you both feel like it, or save one little detail to remember the day by." },
    ],
    ending: "The best part is the story you will have afterwards. Keep it easy, stay curious, and leave a little room for the unexpected.",
  };
}

export function dateTimingLabel(preference: "weekday" | "weekend", time: string, completed = false, date = "") {
  const day = date ? calendarLabel(date, { weekday: "short", day: "numeric", month: "short" }) : preference === "weekday" ? "Weekday" : "Weekend";
  if (!time) return completed ? `${day} date` : `${day} · Time to decide together`;
  const [hour, minute] = time.split(":").map(Number);
  return `${day} · ${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
