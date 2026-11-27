"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { NearbyResult } from "@/lib/maps/schema";
import { AtlasIcon } from "./atlas-icon";
import { useNativeApp } from "./use-native-app";
import styles from "./place-discovery.module.css";

export type DiscoveryPlace = NearbyResult["places"][number];

export function PlacePhoto({ place, priority = false }: { place: DiscoveryPlace; priority?: boolean }) {
  const nativeApp = useNativeApp();
  const [failed, setFailed] = useState<string | null>(null);
  return place.photo && failed !== place.photo.url
    ? <Image src={place.photo.url} alt={`A view of ${place.name}`} fill unoptimized priority={priority} sizes="(max-width: 600px) 92vw, 440px" draggable={false} onError={() => setFailed(place.photo?.url ?? null)} />
    : <div className={styles.photoFallback}>{nativeApp ? <AtlasIcon name="discover-map" size={42} /> : <MapPin size={42} strokeWidth={1.2} aria-hidden="true" />}<span>{place.category}</span></div>;
}

export function PhotoCredit({ place }: { place: Pick<DiscoveryPlace, "mapsUrl" | "photo" | "attributions"> }) {
  return <div className={styles.credit}>
    <a href={place.photo?.sourceUrl ?? place.mapsUrl} target="_blank" rel="noreferrer" translate="no">Google Maps<ArrowUpRight size={12} aria-hidden="true" /></a>
    {place.photo?.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}
    {place.attributions.map((source, index) => source.url ? <a key={`source:${source.name}:${index}`} href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : <span key={`source:${source.name}:${index}`}>{source.name}</span>)}
  </div>;
}
