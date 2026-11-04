"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DatePlan, PlanRequest } from "@/lib/planner/schema";
import { localDateCalendar, type DatePlace } from "@/lib/planner/readiness";
import { calendarLabel, clockLabel, timeMinutes } from "@/lib/planner/schedule";
import { VenueDecisionFacts } from "./venue-decision-facts";
import styles from "./ready-for-date.module.css";

export function ReadyForDate({ place, request, plan, children, showFacts = true }: { place: DatePlace; request: PlanRequest; plan?: DatePlan; children?: ReactNode; showFacts?: boolean }) {
  const download = useRef<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => { if (download.current) URL.revokeObjectURL(download.current); }, []);
  const phone = (plan?.activities[0].experience.phone ?? place.details?.phone)?.replace(/[^+\d]/g, "");
  const booking = plan?.activities[0].experience.bookingUrl ?? place.details?.website;
  function saveCalendar() {
    try {
      setError("");
      const calendar = localDateCalendar(place, request, crypto.randomUUID());
      if (download.current) URL.revokeObjectURL(download.current);
      download.current = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = download.current; link.download = "our-date.ics"; link.hidden = true;
      document.body.appendChild(link); link.click(); link.remove();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Choose your day and time before adding this date to your calendar."); }
  }
  return <section className={styles.ready} aria-label="Ready for your date"><span className={styles.eyebrow}>THE LITTLE DETAILS, TOGETHER</span><h2>Ready for your date.</h2><p className={styles.when}>{request.date ? calendarLabel(request.date) : "Choose a day"} · {request.startTime ? clockLabel(timeMinutes(request.startTime)) : "Choose a time"}<br /><small>{request.timeZone} · {request.guests} people · {request.duration / 60} hours</small></p>{showFacts && <VenueDecisionFacts place={place} request={request} plan={plan} />}<p className={styles.address}>{place.address}</p><div className={styles.actions}><a href={place.mapsUrl} target="_blank" rel="noreferrer">Get directions ↗</a>{phone && <a href={`tel:${phone}`}>Call the venue ↗</a>}{booking && <a href={booking} target="_blank" rel="noreferrer">Check booking options ↗</a>}<button type="button" onClick={saveCalendar}>Add to calendar ↗</button></div>{!booking && <p className={styles.booking}>A booking link isn’t available. Contact the venue through its Maps listing.</p>}{error && <p role="alert" className={styles.error}>{error}</p>}{children}</section>;
}
