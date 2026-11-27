import { calendarInstant } from "./calendar";
import type { ChosenDate } from "./invitations";
import type { SavedRecipe } from "./saved";

type HomeDate = { kind: "chosen"; value: ChosenDate } | { kind: "recipe"; value: SavedRecipe };

export function upcomingHomeDate(dates: readonly ChosenDate[], recipes: readonly SavedRecipe[], now: Date) {
  const candidates: HomeDate[] = [
    ...dates.map(value => ({ kind: "chosen" as const, value })),
    ...recipes.map(value => ({ kind: "recipe" as const, value })),
  ];
  let first: HomeDate | undefined;
  let earliest = Infinity;
  for (const candidate of candidates) {
    if (candidate.kind === "chosen" && candidate.value.dateStatus !== "planned") continue;
    const { date, startTime, timeZone } = candidate.kind === "chosen" ? candidate.value : candidate.value.request;
    if (!date) continue;
    try {
      const time = calendarInstant(date, startTime || "23:59", timeZone).getTime();
      if (time >= now.getTime() && time < earliest) { earliest = time; first = candidate; }
    } catch { /* An unschedulable local time can still be reviewed in Dates. */ }
  }
  return first;
}
