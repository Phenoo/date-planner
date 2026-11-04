import type { NearbyResult } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { calendarLabel, clockLabel, timeMinutes } from "@/lib/planner/schedule";
import { money } from "@/lib/utils";
import styles from "./venue-details.module.css";
import { ReviewArticle } from "./venue-review";

export function VenueDetails({ place, request, inverted = false }: { place: NearbyResult["places"][number]; request: PlanRequest; inverted?: boolean }) {
  const details = place.details;
  const budget = request.budget === null ? null : request.budget * (request.budgetType === "per-person" ? request.guests : 1);
  const currency = (amount: number) => money(amount, details?.price?.currency ?? request.currency);
  return <section className={`${styles.details} ${inverted ? styles.inverted : ""}`} aria-label="Experience information and reviews">
    <div className={styles.facts}>
      <div><span>THE DAY</span><strong>{request.date ? calendarLabel(request.date, { weekday: "short", day: "numeric", month: "short" }) : "Choose a day"}</strong><p>{request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time"} · {request.guests} people</p></div>
      <div><span>GETTING THERE</span><strong>{details ? `About ${details.travelMinutes} min each way` : "Travel time unconfirmed"}</strong><p>Travel is an estimate.</p></div>
      <div><span>YOUR SPENDING CEILING</span><strong>{budget === null ? "Open budget" : money(budget, request.currency)}</strong><p>{request.includeTransport ? "Including transportation" : "Transportation separate"}</p></div>
    </div>
    <div className={styles.logistics}>
      <h3>A little preparation.</h3>
      <p>{details?.opening === "fits" ? "The listed opening hours fit your selected visit. " : "Opening hours for this visit still need confirmation. "}Reservation availability is not connected; confirm your visit directly with the venue.</p>
      {details?.price ? <p>Google Maps typical spend: {details.price.min !== undefined ? `${currency(details.price.min)}${details.price.max !== undefined ? ` – ${currency(details.price.max)}` : "+"}` : `up to ${currency(details.price.max ?? 0)}`} per person. This is a provider estimate, not a quote. Transport, extras and final charges need confirmation.</p> : <p>Venue pricing is unavailable. {budget !== null ? `Keep the complete date within ${money(budget, request.currency)} and confirm the venue's costs before committing.` : "Ask the venue about costs before committing."}</p>}
      {(request.dietary.length > 0 || request.accessibility || request.quiet) && <p>Confirm your dietary, access and atmosphere requirements with the venue before going.</p>}
      <p className={styles.address}>{place.address}</p>
      <div className={styles.links}><a href={place.mapsUrl} target="_blank" rel="noreferrer">Directions on Google Maps ↗</a>{details?.website && <a href={details.website} target="_blank" rel="noreferrer">Visit the venue website ↗</a>}</div>
      {details?.hours.length ? <details><summary>Listed opening hours</summary>{details.hours.map((line) => <p key={line}>{line}</p>)}</details> : null}
    </div>
    <div className={styles.reviews}>
      <div className={styles.reviewHeading}><h3>What people say.</h3>{details?.rating !== undefined && <span>{details.rating.toFixed(1)} / 5 · {details.reviewCount ?? 0} Google reviews</span>}</div>
      {details?.reviews.length ? details.reviews.slice(0, 3).map((review, index) => <ReviewArticle key={`${review.author}:${index}`} review={review} />) : <p>Reviews aren&apos;t available here yet. <a href={place.mapsUrl} target="_blank" rel="noreferrer">Read reviews on Google Maps ↗</a></p>}
      {details && <small>Venue information checked {new Date(details.checkedAt).toLocaleDateString("en-GB")}. Hours can change. Travel is an estimate, without live traffic.</small>}
    </div>
  </section>;
}
