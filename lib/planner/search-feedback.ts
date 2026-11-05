import type { SearchIssue } from "@/lib/maps/schema";
import type { PlanRequest } from "./schema";
import type { PlannerQuestionId } from "./questions";
import { calendarLabel, clockLabel, timeMinutes } from "./schedule";
import { money } from "@/lib/utils";
import { minimumGoogleRating } from "@/lib/maps/recommendation-quality";

const dietaryList = (dietary: PlanRequest["dietary"]) => dietary.join(", ");

export function requirementsGuidance(request: Pick<PlanRequest, "dietary" | "accessibility">) {
  const unverified = request.dietary.filter((diet) => diet !== "vegetarian");
  if (unverified.length) return `You selected ${dietaryList(request.dietary)}${request.accessibility ? " and step-free access" : ""}. Live place listings cannot verify ${dietaryList(unverified)} options. We need confirmed venue information for a match. Keep essential needs selected; remove only accidental selections.`;
  if (request.dietary.length || request.accessibility) return `We’ll only suggest places with source information confirming ${[request.dietary.length ? "vegetarian options" : "", request.accessibility ? "an accessible entrance" : ""].filter(Boolean).join(" and ")}. Missing venue information may limit matches. Keep essential requirements selected.`;
  return "Select only what you need. Every selected dietary option and access need is required, so we must confirm all of them before recommending a place.";
}

export type SearchFeedback = { title: string; message: string; question: PlannerQuestionId; action: string };
export function searchFeedback(issue: SearchIssue, request: PlanRequest): SearchFeedback {
  switch (issue) {
    case "google-rating": return { title: "No places met our Google review standard", message: `We only recommend places with a confirmed Google average rating above ${minimumGoogleRating} stars. Try another destination or widen your search area.`, question: "area", action: "Change destination or distance" };
    case "unverified-dietary": return { title: `${dietaryList(request.dietary.filter((diet) => diet !== "vegetarian")).replace(/^./, (letter) => letter.toUpperCase())} options couldn’t be verified`, message: "Live listings don’t confirm these requirements. Keep essential needs selected; remove only accidental selections. You can also try another destination.", question: "requirements", action: "Review dietary needs" };
    case "vegetarian": return { title: "Vegetarian options weren’t confirmed", message: "Places were excluded because their listings didn’t confirm vegetarian food. Review an accidental selection or try another destination while keeping this requirement.", question: "requirements", action: "Review dietary needs" };
    case "accessible-entrance": return { title: "Step-free access wasn’t confirmed", message: "Nearby listings didn’t confirm an accessible entrance. Keep this selected if you need it, or remove an accidental selection. You can also try another destination.", question: "requirements", action: "Review access needs" };
    case "travel-time": return { title: "This place is too far for the visit", message: "Choose a closer destination or review your starting point.", question: "area", action: "Review destination and distance" };
    case "opening-hours": return { title: "Your visit doesn’t fit opening hours", message: `Some places couldn’t fit your visit starting at ${clockLabel(timeMinutes(request.startTime))} on ${calendarLabel(request.date)}. Try another start time or day.`, question: "time", action: "Change starting time" };
    case "budget": return { title: "Listed prices exceed your limit", message: `Some listed minimum venue prices for ${request.guests} ${request.guests === 1 ? "person" : "people"} exceed ${money(request.budget ?? 0, request.currency)} ${request.budgetType === "per-person" ? "per person" : "total"}. Review your limit or try another destination.`, question: "budget", action: "Review spending limit" };
    case "distance": return { title: "Places fall outside your search reach", message: `Some places found were beyond your ${Math.min(request.maxDistance, 50)} km search reach. Choose another destination or widen the reach.`, question: "area", action: "Review destination and distance" };
    case "preferences": return { title: "The places found weren’t a close enough match", message: "Review your vibe and interests, or try a different destination. Your requirements are still in place.", question: "vibes", action: "Review date vibe" };
    case "venue-changed": return { title: "The final venue check changed", message: "The selected place no longer fits the schedule or requirements after checking its latest details. Review your answers before trying again.", question: "review", action: "Review date details" };
    case "no-places": return { title: "No available places to check here", message: `We didn’t find available places to check around ${request.locationScope === "city" ? request.city : `${request.area}, ${request.city}`}. Try another destination or a wider search reach.`, question: "area", action: "Change destination" };
  }
}
