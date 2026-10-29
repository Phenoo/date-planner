const asset = (name: string, json = false) => ({ src: `/animations/${name}.${json ? "json" : "lottie"}`, fallback: `/animations/${name}.svg` });
const atlas = (pose: string) => asset(`atlas/${pose}`);
export const animations = {
  splash: atlas("welcome"), discover: atlas("welcome"), preferences: atlas("explaining"),
  itinerary: atlas("learned"), concierge: atlas("thoughtful"), location: atlas("location"),
  guests: atlas("guests"), budget: atlas("budget"), calendar: atlas("calendar"), clock: atlas("clock"),
  review: atlas("learned"), empty: atlas("thoughtful"), idle: atlas("idle"), still: atlas("still"),
  success: asset("success", true), celebration: atlas("learned"), error: atlas("attentive"),
  swap: asset("swap"), lock: asset("lock"),
} as const;
export type AnimationName = keyof typeof animations;
export type CompanionTheme = "white" | "red" | "dark";
const humanPoses: Record<AnimationName, string> = {
  splash: "welcome", discover: "welcome", preferences: "explaining", itinerary: "learned", concierge: "thoughtful", location: "location", guests: "guests", budget: "budget", calendar: "calendar", clock: "clock", review: "learned", empty: "thoughtful", idle: "idle", still: "still", success: "learned", celebration: "learned", error: "attentive", swap: "explaining", lock: "attentive",
};
export function humanAtlasAsset(pose: AnimationName, theme: CompanionTheme = "white") { return asset(`atlas/human/${theme}/${humanPoses[pose]}`); }
const lively = (pose: string) => asset(`atlas/lively/${pose}`);
export const livelyAtlasAnimations: Partial<Record<AnimationName, ReturnType<typeof asset>>> = {
  discover: lively("welcome"), preferences: lively("explaining"),
  itinerary: lively("learned"), review: lively("learned"),
  location: lively("location"), guests: lively("guests"), budget: lively("budget"),
  calendar: lively("calendar"), clock: lively("clock"),
  concierge: lively("thoughtful"),
};
export const plannerAnimations: Readonly<Record<string, AnimationName>> = {
  city: "location", area: "location", occasion: "discover", people: "guests",
  yourGender: "guests", dateGender: "preferences",
  vibes: "discover", interests: "preferences", requirements: "preferences",
  budget: "budget", date: "calendar", time: "clock", duration: "clock", review: "review",
};
