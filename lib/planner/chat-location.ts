import type { DetectedLocation } from "@/lib/maps/schema";
import type { PlanRequest } from "./schema";
import { intakeNextField, intakeQuestion, type ChatSession, type IntakeField } from "./intake";
import { zonedNow } from "./schedule";
import { destinationCurrency } from "./currency";

export function confirmChatLocation(request: PlanRequest, session: ChatSession, location: DetectedLocation["location"], today = zonedNow(request.timeZone).date) {
  const updated: PlanRequest = {
    ...destinationCurrency(request, location.country), timeZoneConfirmed: location.city === request.city && location.country === request.country && request.timeZoneConfirmed, city: location.city, area: location.city,
    currentCity: location.city, startingArea: location.area, locationScope: "city",
  };
  const answered: IntakeField[] = [...new Set<IntakeField>([...session.answered.filter((field) => field !== "budget" || request.currency === updated.currency), "location"])];
  const nextField = intakeNextField(updated, answered, today);
  return { request: updated, answered, nextField, message: `Let’s plan in ${location.city}.\n\n${intakeQuestion(nextField)}` };
}
