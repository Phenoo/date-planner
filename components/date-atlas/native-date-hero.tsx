"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { upcomingHomeDate } from "@/lib/planner/upcoming-date";
import { dateTimingLabel } from "@/lib/planner/date-story";
import { dateHistoryResponseSchema, type ChosenDate } from "@/lib/planner/invitations";
import type { SavedRecipe } from "@/lib/planner/saved";
import { money } from "@/lib/utils";
import { AtlasIcon } from "./atlas-icon";
import { PhotoCredit, PlacePhoto, type DiscoveryPlace } from "./place-photo";
import styles from "./native-discovery.module.css";

export function NativeDateHero({ ownerId, recipes, idea, city, saveButton, onIdea, onOpenRecipe, onPlan, onResume }: {
  ownerId: string | null;
  recipes: SavedRecipe[];
  idea?: DiscoveryPlace;
  city: string;
  saveButton: ReactNode;
  onIdea: () => void;
  onOpenRecipe: (recipe: SavedRecipe) => void;
  onPlan: () => void;
  onResume?: () => void;
}) {
  const [history, setHistory] = useState<{ owner: string; dates: ChosenDate[] } | null>(null);
  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    async function load(owner: string) {
      try {
        const response = await plannerFetch("/api/date-history?status=planned", { cache: "no-store", signal: controller.signal });
        const data = dateHistoryResponseSchema.parse(await readPlanningResponse(response, () => {}));
        if (!controller.signal.aborted) setHistory({ owner, dates: data.dates });
      } catch { /* A nearby idea remains available when history cannot be refreshed. */ }
    }
    void load(ownerId);
    return () => controller.abort();
  }, [ownerId]);

  const upcoming = upcomingHomeDate(history?.owner === ownerId ? history.dates : [], recipes, new Date());
  const recipe = upcoming?.kind === "recipe" ? upcoming.value : undefined;
  const chosen = upcoming?.kind === "chosen" ? upcoming.value : undefined;
  const schedule = recipe?.request ?? chosen;
  const suggestion = !upcoming && !onResume ? idea : undefined;
  const title = recipe?.title ?? chosen?.title ?? chosen?.place?.name ?? chosen?.story.title
    ?? (onResume ? "Pick up where you left off." : suggestion?.name ?? "Dinner, without the rush.");
  const photo = chosen?.place?.photo?.url ?? (recipe?.image.startsWith("/images/") ? recipe.image : undefined);
  const timing = schedule && dateTimingLabel(schedule.datePreference, schedule.startTime, false, schedule.date);
  const label = upcoming ? "Upcoming date" : onResume ? "In progress" : "Date idea";
  const action = chosen ? "Open our dates" : recipe ? "Open date plan" : onResume ? "Continue your plan" : suggestion ? "See the date idea" : "Start planning";
  const credit = chosen?.source === "google" ? chosen.place : suggestion;

  return <article className={styles.feature}>
    <div className={styles.featurePhoto}>
      {suggestion ? <PlacePhoto key={suggestion.id} place={suggestion} priority /> :
        <Image src={photo || "/images/restaurant.jpg"} alt={photo && chosen?.place ? chosen.place.name : "Illustrative dinner setting"} fill priority unoptimized={Boolean(chosen?.place?.photo)} sizes="(max-width: 720px) 100vw, 640px" />}
      <span className={styles.shade} />
      {chosen ? <Link className={styles.openPhoto} href="/saved" aria-label={`${action}: ${title}`} /> :
        <button type="button" className={styles.openPhoto} aria-label={`${action}: ${title}`} onClick={recipe ? () => onOpenRecipe(recipe) : onResume ?? (suggestion ? onIdea : onPlan)} />}
      <span className={styles.photoTag}><AtlasIcon name={upcoming ? "calendar-heart" : "plan-note"} size={15} />{label}</span>
      {suggestion && saveButton}
      <div className={styles.heroCopy}>
        <h2>{title}</h2>
        <p><AtlasIcon name="map-pin" size={15} />{schedule?.city ?? city}{recipe && <span> · {money(recipe.total, recipe.request.currency)} estimated</span>}</p>
        <div className={styles.heroFoot}><span>{timing ?? action}</span><AtlasIcon name="arrow-up-right" size={16} /></div>
      </div>
    </div>
    {credit && <div className={styles.photoCredit}><PhotoCredit place={credit} /></div>}
  </article>;
}
