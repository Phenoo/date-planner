import type { NearbyResult } from "@/lib/maps/schema";
import type { DatePlan, PlanRequest } from "./schema";
import { formatMoney } from "./currency";
import { dateCalendar } from "./calendar";
import { fallbackDateStory } from "./date-story";

export type DatePlace = NearbyResult["places"][number];
export function catalogPlace(plan: DatePlan): DatePlace {
  const activity = plan.activities[0];
  const venue = activity.experience;
  const query = new URLSearchParams({ api: "1", query: `${venue.lat},${venue.lng}`, ...(venue.placeId ? { query_place_id: venue.placeId } : {}) });
  return { id: venue.id, name: venue.venue, category: venue.category, address: `${venue.area}, ${venue.city}, ${venue.country}`, distanceKm: activity.distance, reason: activity.reason, mapsUrl: `https://www.google.com/maps/search/?${query}`, attributions: [], photo: { url: venue.image, authors: [] } };
}
export function venueDecision(place: DatePlace, request: PlanRequest, plan?: DatePlan) {
  const price = place.details?.price;
  const money = (amount: number, currency = request.currency) => formatMoney(amount, currency);
  const missing: string[] = [];
  let cost = "Venue price unconfirmed";
  let costLabel = "Cost to check";
  if (plan) {
    cost = money(plan.total);
    costLabel = plan.unpricedCosts?.length ? "Known costs, transport extra" : "Estimated date total";
    if (plan.activities[0].experience.priceNote) missing.push(plan.activities[0].experience.priceNote);
    if (plan.unpricedCosts?.includes("transport")) missing.push("Transport has no quote. The complete date has not been confirmed within your spending limit.");
  } else if (price && (price.min !== undefined || price.max !== undefined)) {
    const low = price.min === undefined ? undefined : money(price.min * request.guests, price.currency);
    const high = price.max === undefined ? undefined : money(price.max * request.guests, price.currency);
    cost = low && high ? low === high ? low : `${low}–${high}` : low ? `From ${low}` : `Up to ${high}`;
    costLabel = `Venue estimate for ${request.guests}`;
    missing.push("Provider estimate only; final charges and extras need venue confirmation.");
    if (request.includeTransport && request.transport !== "Walking") missing.push("Travel fare is not included in this venue estimate.");
    if (price.currency !== request.currency) missing.push(`Venue prices use ${price.currency}; your ${request.currency} budget has not been converted or compared.`);
  } else missing.push("Ask the venue about prices before committing. Your spending limit is unchanged.");
  const travel = plan ? plan.activities[0].travelMinutes : place.details?.travelMinutes;
  const opening = plan ? "Listed hours fit your visit" : place.details?.opening === "fits" ? "Listed hours fit your visit" : "Opening hours unconfirmed";
  if (!plan && place.details?.opening !== "fits") missing.push("Confirm opening hours for your selected day and time.");
  return { cost, costLabel, travel: travel === undefined ? "Travel time unconfirmed" : `About ${travel} min each way`, opening, missing };
}
export function localDateCalendar(place: DatePlace, request: PlanRequest, id: string, now = new Date()) {
  return dateCalendar({ city: request.city, country: request.country, timeZone: request.timeZone, date: request.date, startTime: request.startTime, duration: request.duration, datePreference: request.datePreference, source: "google", place, placeId: place.id, story: fallbackDateStory(place.category), response: "pending", dateStatus: "planned", createdAt: now.toISOString() }, id);
}
