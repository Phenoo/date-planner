"use client";
import { useState } from "react";
import Image from "next/image";
import type { PublicInvitation } from "@/lib/planner/invitations";
import styles from "./date-journey.module.css";

export function ChosenPlaceCard({ place, placeId, animated = false }: { place: PublicInvitation["place"]; placeId: string; animated?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const maps = place?.mapsUrl ?? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: "Date venue", query_place_id: placeId })}`;
  return <article className={`${styles.chosenCard} ${animated ? styles.chosenCardAnimated : ""}`}>
    <div className={styles.cardTop}><span>A DATE AT LAS</span><span>MADE FOR TWO</span></div>
    <div className={styles.photo}>{place?.photo && !photoFailed ? <><Image src={place.photo.url} alt={`A view of ${place.name}`} fill unoptimized sizes="(max-width: 600px) 85vw, 390px" onError={() => setPhotoFailed(true)} /><div className={styles.photoCredit}>{place.photo.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}</div></> : <div className={styles.cardLetter} aria-hidden="true">{place?.name.charAt(0) ?? "♡"}</div>}</div>
    <span className={styles.category}>{place?.category ?? "YOUR CHOSEN PLACE"}</span><h2>{place?.name ?? "A date worth looking forward to."}</h2>{place && <p>{place.address}</p>}
    {!place && <p>Place details are temporarily unavailable. You can still open the chosen location on Maps.</p>}
    <a className={styles.mapLink} href={maps} target="_blank" rel="noreferrer">View on Google Maps <span aria-hidden="true">↗</span></a>
    {place?.attributions.map((item, index) => <small key={`${item.name}:${index}`}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</small>)}
  </article>;
}
