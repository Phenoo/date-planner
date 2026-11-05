"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, ChevronDown, Heart, Info, MapPin, RotateCcw, Star, X } from "lucide-react";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { cityDiscoveryResultSchema, type CityDiscoveryResult } from "@/lib/maps/place-discovery";
import type { NearbyResult } from "@/lib/maps/schema";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import styles from "./place-discovery.module.css";

type Place = NearbyResult["places"][number];
type Destination = { city: string; country: string };

function PlacePhoto({ place, priority = false }: { place: Place; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return place.photo && !failed ? <Image src={place.photo.url} alt={`A view of ${place.name}`} fill unoptimized priority={priority} sizes="(max-width: 600px) 92vw, 440px" draggable={false} onError={() => setFailed(true)} /> : <div className={styles.photoFallback}><MapPin size={42} strokeWidth={1.2} aria-hidden="true" /><span>{place.category}</span></div>;
}

function PhotoCredit({ place }: { place: Place }) {
  return <div className={styles.credit}><a href={place.photo?.sourceUrl ?? place.mapsUrl} target="_blank" rel="noreferrer" translate="no">Google Maps<ArrowUpRight size={12} aria-hidden="true" /></a>{place.photo?.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}{place.attributions.map((source, index) => source.url ? <a key={`source:${source.name}:${index}`} href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : <span key={`source:${source.name}:${index}`}>{source.name}</span>)}</div>;
}

export function PlaceDiscovery({ city, country, onPlan, onPlanNearby }: Destination & { onPlan: () => void; onPlanNearby: (place: Place, destination: Destination) => void }) {
  const [destination, setDestination] = useState<Destination>({ city, country });
  const [locationOpen, setLocationOpen] = useState(false);
  const [data, setData] = useState<CityDiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [batch, setBatch] = useState(0);
  const [details, setDetails] = useState<Place | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"pass" | "plan" | null>(null);
  const seen = useRef<string[]>([]);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const emptyHeading = useRef<HTMLHeadingElement>(null);
  const focusEmpty = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await plannerFetch("/api/discover-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...destination, excludeIds: seen.current.slice(-60) }), cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const result = cityDiscoveryResultSchema.parse(await readPlanningResponse(response, () => {}));
        if (!controller.signal.aborted) { setData(result); setIndex(0); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Places couldn’t be loaded. Please try again.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); pointer.current = null; };
  }, [destination, batch]);

  const place = data?.places[index];
  useEffect(() => {
    if (!loading && data && !place && focusEmpty.current) { focusEmpty.current = false; emptyHeading.current?.focus(); }
  }, [data, place, loading]);
  const cardStyle: CSSProperties & { "--drag-x": string; "--drag-rotate": string } = { "--drag-x": `${drag}px`, "--drag-rotate": `${drag / 18}deg`, transform: "translateX(var(--drag-x)) rotate(var(--drag-rotate))", transition: dragging ? "none" : undefined };
  function loadMore() { setLoading(true); setError(""); setData(null); setLeaving(null); setDrag(0); setBatch(value => value + 1); }
  function choose(action: "pass" | "plan") { if (!place || leaving) return; pointer.current = null; setDragging(false); setLeaving(action); }
  function finishSwipe() {
    if (!place || !leaving) return;
    const action = leaving;
    seen.current = [...new Set([...seen.current, place.id])].slice(-60);
    setLeaving(null); setDrag(0);
    if (action === "plan") onPlanNearby(place, destination);
    else { focusEmpty.current = index + 1 >= (data?.places.length ?? 0); setIndex(value => value + 1); }
  }
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (leaving || !event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest("a,button"))) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x;
    if (Math.abs(event.clientY - start.y) > Math.abs(x) + 20) { pointer.current = null; setDragging(false); setDrag(0); return; }
    setDrag(Math.max(-250, Math.min(250, x)));
  }
  function endDrag(event: PointerEvent<HTMLElement>) {
    const start = pointer.current;
    pointer.current = null;
    setDragging(false);
    if (!start || start.id !== event.pointerId) { setDrag(0); return; }
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 90 && Math.abs(x) > Math.abs(y) * 1.3) choose(x < 0 ? "pass" : "plan");
    else setDrag(0);
  }

  return <main className={styles.page}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>A PLACE. A POSSIBILITY.</span><h1>Where next?</h1></div><button className={styles.location} type="button" onClick={() => setLocationOpen(true)} aria-label={`Change destination, currently ${destination.city}, ${destination.country}`}><MapPin size={16} aria-hidden="true" /><span>{destination.city}</span><ChevronDown size={15} aria-hidden="true" /></button></header>
    <p className={styles.intro}>Find somewhere you’d love to go together.</p>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{place ? `${place.name}. ${place.category}. Place ${index + 1} of ${data?.places.length}.` : !loading && !error ? "End of this collection. Find more places or change city." : ""}</p>
    <div className={styles.discovery} aria-busy={loading}>
      {loading ? <div className={styles.loading} role="status"><div className={styles.skeleton} aria-hidden="true" /><span>Finding good places in {destination.city}…</span></div> : error ? <div className={styles.empty}><MapPin size={32} aria-hidden="true" /><h2>A little connection hiccup.</h2><p role="alert">{error}</p><Button onClick={loadMore}>Try again<RotateCcw size={16} aria-hidden="true" /></Button><button type="button" className={styles.textButton} onClick={() => setLocationOpen(true)}>Choose another city</button></div> : place ? <>
        <div className={styles.stack}>
          {data?.places.slice(index + 1, index + 3).reverse().map((next, offset, items) => <div key={next.id} className={styles.backCard} style={{ transform: `translateY(${(items.length - offset) * 9}px) rotate(${offset === 0 ? -4 : 3}deg) scale(${1 - (items.length - offset) * .035})` }} aria-hidden="true"><PlacePhoto place={next} /></div>)}
          <article key={place.id} className={`${styles.card} ${leaving === "pass" ? styles.pass : leaving === "plan" ? styles.plan : ""}`} style={cardStyle} aria-label={place.name} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { pointer.current = null; setDragging(false); setDrag(0); }} onAnimationEnd={event => { if (event.target === event.currentTarget && leaving) finishSwipe(); }}>
            <PlacePhoto key={place.id} place={place} priority />
            <div className={styles.shade} />
            <div className={styles.cardTop}><span>{place.category}</span>{place.details?.rating !== undefined && <span className={styles.rating}><Star size={14} fill="currentColor" aria-hidden="true" />{place.details.rating.toFixed(1)}<small>({place.details.reviewCount?.toLocaleString() ?? "Google"})</small></span>}</div>
            {Math.abs(drag) > 35 && <span className={`${styles.swipeLabel} ${drag > 0 ? styles.swipeYes : ""}`} aria-hidden="true">{drag > 0 ? "LET’S GO" : "NEXT"}</span>}
            <div className={styles.cardBody}><h2>{place.name}</h2><p><MapPin size={15} aria-hidden="true" />{place.address || destination.city}</p><PhotoCredit place={place} /></div>
          </article>
        </div>
        <div className={styles.controls}>
          <div><button type="button" className={styles.skip} disabled={!!leaving} onClick={() => choose("pass")} aria-label={`Pass on ${place.name}`}><X size={25} strokeWidth={1.7} aria-hidden="true" /></button><span>Pass</span></div>
          <div><button type="button" className={styles.info} disabled={!!leaving} onClick={() => setDetails(place)} aria-label={`Details about ${place.name}`}><Info size={23} strokeWidth={1.6} aria-hidden="true" /></button><span>Details</span></div>
          <div><button type="button" className={styles.like} disabled={!!leaving} onClick={() => choose("plan")} aria-label={`Plan a date near ${place.name}`}><Heart size={26} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /></button><span>Plan nearby</span></div>
        </div>
        <p className={styles.hint}>Swipe left to pass. Right to plan nearby.</p>
        <p className={styles.source} translate="no">Places from Google Maps · Ratings above 3.75</p>
      </> : <div className={styles.empty}><Heart size={32} strokeWidth={1.4} aria-hidden="true" /><h2 ref={emptyHeading} tabIndex={-1}>{data?.places.length ? "That’s this little collection." : "A new place is worth finding."}</h2><p>{data?.places.length ? "See what else is around, or try another city." : `We couldn’t find more places with a confirmed Google rating above 3.75 in ${destination.city}. Try a nearby city.`}</p><Button onClick={loadMore}>Find more places<ArrowRight size={16} aria-hidden="true" /></Button><button type="button" className={styles.textButton} onClick={() => setLocationOpen(true)}>Change city</button></div>}
    </div>
    <button type="button" className={styles.plannerLink} onClick={onPlan}>Have something in mind? Plan your date<ArrowRight size={15} aria-hidden="true" /></button>
    <Dialog open={locationOpen} onOpenChange={setLocationOpen} title="Where would you like to explore?" description="Choose any city. We’ll find real places around its centre.">
      <form key={`${destination.city}:${destination.country}`} className={styles.locationForm} onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); const city = String(fields.get("city") ?? "").trim(); const country = String(fields.get("country") ?? "").trim(); if (city.length < 2 || country.length < 2) return; seen.current = []; setLoading(true); setError(""); setData(null); setLeaving(null); setDrag(0); setDestination({ city, country }); setLocationOpen(false); }}><label>City<input required minLength={2} maxLength={80} name="city" defaultValue={destination.city} autoComplete="address-level2" /></label><label>Country<input required minLength={2} maxLength={80} name="country" defaultValue={destination.country} autoComplete="country-name" /></label><Button type="submit">Show me places<ArrowRight size={16} aria-hidden="true" /></Button></form>
    </Dialog>
    <Dialog open={details !== null} onOpenChange={open => { if (!open) setDetails(null); }} title={details?.name ?? "Place details"} description="A closer look before you plan.">
      {details && <div className={styles.details}><div className={styles.detailPhoto}><PlacePhoto key={details.id} place={details} /><PhotoCredit place={details} /></div><span className={styles.eyebrow}>{details.category}</span><h2>{details.name}</h2><p>{details.address}</p><div className={styles.detailFacts}>{details.details?.rating !== undefined && <span><Star size={17} aria-hidden="true" />{details.details.rating.toFixed(1)} on Google{details.details.reviewCount !== undefined ? ` · ${details.details.reviewCount.toLocaleString()} reviews` : ""}</span>}<span><MapPin size={17} aria-hidden="true" />{details.distanceKm.toFixed(1)} km from {destination.city} centre</span></div>{!!details.details?.hours.length && <details className={styles.hours}><summary>Opening hours</summary><ul>{details.details.hours.map(day => <li key={day}>{day}</li>)}</ul></details>}<p className={styles.detailNote}>We’ll check the date, time and your preferences in the planner. Confirm current prices and reservations with the venue.</p><Button onClick={() => onPlanNearby(details, destination)}>Plan nearby<ArrowRight size={16} aria-hidden="true" /></Button><a className={styles.sourceLink} href={details.mapsUrl} target="_blank" rel="noreferrer">See the place on Google Maps<ArrowUpRight size={16} aria-hidden="true" /></a>{details.attributions.map((source, i) => source.url ? <a className={styles.attribution} key={`${source.name}:${i}`} href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : <small key={`${source.name}:${i}`}>{source.name}</small>)}</div>}
    </Dialog>
  </main>;
}
