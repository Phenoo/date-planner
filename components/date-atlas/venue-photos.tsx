"use client";

import { useState } from "react";
import Image from "next/image";
import type { NearbyResult } from "@/lib/maps/schema";
import styles from "./venue-photos.module.css";

type Place = NearbyResult["places"][number];
type Photo = NonNullable<Place["photos"]>[number];

function VenuePhoto({ photo, name, onError }: { photo: Photo; name: string; onError: () => void }) {
  return <figure className={styles.photo}>
    <div><Image src={photo.url} alt={`Another view of ${name}`} fill unoptimized loading="lazy" sizes="(max-width:600px) 76vw, 400px" onError={onError} /></div>
    <figcaption>{photo.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}</figcaption>
  </figure>;
}

export function VenuePhotos({ place, inverted = false }: { place: Place; inverted?: boolean }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = [...new Map((place.photos ?? []).map(photo => [photo.url, photo])).values()].filter(photo => photo.url !== place.photo?.url && !failed.has(photo.url)).slice(0, 5);
  if (!photos.length) return null;
  return <section className={`${styles.gallery} ${inverted ? styles.inverted : ""}`} aria-label={`More photos of ${place.name}`}>
    <h3>Take a look around.</h3><p>Photos from Google Maps. Scroll sideways to explore.</p>
    <div className={styles.track} role="group" tabIndex={0} aria-label={`Scroll through photos of ${place.name}`} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation(); }}>{photos.map(photo => <VenuePhoto key={photo.url} photo={photo} name={place.name} onError={() => setFailed(previous => previous.has(photo.url) ? previous : new Set([...previous, photo.url]))} />)}</div>
  </section>;
}
