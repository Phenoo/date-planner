"use client";
import { useState } from "react";
import Image from "next/image";
import type { PublicInvitation } from "@/lib/planner/invitations";
import type { PlanRequest } from "@/lib/planner/schema";
import { VenueDecisionFacts } from "./venue-decision-facts";
import styles from "./date-journey.module.css";

export function ChosenPlaceCard({ place, placeId, animated = false, catalog = false, request, showMapLink = true }: { place: PublicInvitation["place"]; placeId: string; animated?: boolean; catalog?: boolean; request?: PlanRequest; showMapLink?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const maps = place?.mapsUrl ?? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: "Date venue", query_place_id: placeId })}`;
  return <article className={`${styles.chosenCard} ${animated ? styles.chosenCardAnimated : ""}`}>
    <div className={styles.cardTop}><span>A DATE AT LAS</span><span>MADE FOR TWO</span></div>
    <div className={styles.photo}>{place?.photo && !photoFailed ? <><Image src={place.photo.url} alt={catalog ? "Illustrative date atmosphere" : `A view of ${place.name}`} fill unoptimized loading={animated ? "eager" : "lazy"} sizes="(max-width: 600px) 85vw, 390px" onError={() => setPhotoFailed(true)} /><div className={styles.photoCredit}>{!catalog && !showMapLink && <a className={styles.googleMapsCredit} href={place.photo.sourceUrl ?? maps} target="_blank" rel="noreferrer" translate="no">Google Maps</a>}{place.photo.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}</div></> : <div className={styles.cardLetter} aria-hidden="true">{place?.name.charAt(0) ?? "♡"}</div>}</div>
    <span className={styles.category}>{place?.category ?? "YOUR CHOSEN PLACE"}</span><h2>{place?.name ?? "A date worth looking forward to."}</h2>{place && <p className={styles.venueAddress}>{place.address}</p>}
    {catalog && place?.photo && <small>Illustrative date photography</small>}
    {place && request && <VenueDecisionFacts place={{ ...place, distanceKm: 0, reason: "" }} request={request} />}
    {!place && <p>{catalog ? "This experience is no longer listed. Ask the creator to review the date before going." : "Place details are temporarily unavailable. You can still open the chosen location on Maps."}</p>}
    {showMapLink && (!catalog || place) && <a className={styles.mapLink} href={maps} target="_blank" rel="noreferrer">View on Google Maps <span aria-hidden="true">↗</span></a>}
    {!catalog && place && !showMapLink && (!place.photo || photoFailed) && <a className={`${styles.googleMapsCredit} ${styles.googleMapsFallback}`} href={maps} target="_blank" rel="noreferrer" translate="no">Google Maps</a>}
    {place?.attributions.map((item, index) => <small key={`${item.name}:${index}`}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</small>)}
  </article>;
}
