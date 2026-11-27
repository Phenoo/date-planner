"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Heart, Info, MapPin, RotateCcw, Star, X } from "lucide-react";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { cityDiscoveryResultSchema, type CityDiscoveryResult } from "@/lib/maps/place-discovery";
import type { Coordinates, NearbyResult } from "@/lib/maps/schema";
import { getBrowserCoordinates, nativeLocationSupport, resolveLocation, subscribeNativeLocation } from "@/lib/maps/client-location";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNativeApp } from "./use-native-app";
import styles from "./place-discovery.module.css";
import { PlacePhoto, PhotoCredit } from "./place-photo";
import type { PlannerMode } from "@/lib/planner/intake";
import type { SavedRecipe } from "@/lib/planner/saved";
import { NativeDiscovery } from "./native-discovery";

type Place = NearbyResult["places"][number];
type Destination = { city: string; country: string; coordinates?: Coordinates };
const serverLocationSupport = () => false;

export function PlaceDiscovery({ city, country, onPlan, onPlanNearby, recipes, onOpenRecipe, ownerId = null, onAuth = () => {}, onPlus = () => {}, onResume }: Destination & { recipes: SavedRecipe[]; onOpenRecipe: (recipe: SavedRecipe) => void; onPlan: (mode?: PlannerMode, destination?: Destination) => void; onPlanNearby: (place: Place, destination: Destination) => void; ownerId?: string | null; onAuth?: () => void; onPlus?: () => void; onResume?: () => void }) {
  const nativeApp = useNativeApp();
  const [destination, setDestination] = useState<Destination>({ city, country });
  const nativeLocation = useSyncExternalStore(subscribeNativeLocation, nativeLocationSupport, serverLocationSupport);
  const [locationReady, setLocationReady] = useState(false);
  const [locationRevision, setLocationRevision] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const locationController = useRef<AbortController | null>(null);
  const locationPending = useRef(false);
  const manualLocation = useRef(false);
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
    if (nativeLocation === null) return;
    const controller = new AbortController();
    locationController.current = controller;
    locationPending.current = nativeLocation && !manualLocation.current;
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      if (nativeLocation && !manualLocation.current) {
        setLocationReady(false); setLocating(true); setLoading(true); setLocationMessage("");
        try {
          const coordinates = await getBrowserCoordinates(controller.signal);
          const detected = await resolveLocation(coordinates, controller.signal);
          if (controller.signal.aborted) return;
          seen.current = [];
          setDestination({ city: detected.location.city, country: detected.location.country, coordinates });
        } catch (failure) {
          if (controller.signal.aborted) return;
          setDestination(previous => ({ city: previous.city, country: previous.country }));
          setLocationMessage(failure instanceof Error ? failure.message : "Your location couldn't be found. Choose a city manually.");
        }
      }
      if (!controller.signal.aborted) { locationPending.current = false; setLocationReady(true); setLocating(false); }
    });
    return () => { controller.abort(); };
  }, [nativeLocation, locationRevision]);

  useEffect(() => {
    if (!locationReady || locationPending.current) return;
    const controller = new AbortController();
    void (async () => {
      try {
        await planningToken(controller.signal);
        const response = await plannerFetch("/api/discover-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...destination, excludeIds: seen.current.slice(-60) }), cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        const result = cityDiscoveryResultSchema.parse(await readPlanningResponse(response, () => {}));
        if (!controller.signal.aborted) { setData(result); setIndex(0); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Places couldn’t be loaded. Please try again.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); pointer.current = null; };
  }, [destination, batch, locationReady]);

  const place = data?.places[index];
  useEffect(() => {
    if (!loading && data && !place && focusEmpty.current) { focusEmpty.current = false; emptyHeading.current?.focus(); }
  }, [data, place, loading]);
  const cardStyle: CSSProperties & { "--drag-x": string; "--drag-rotate": string } = { "--drag-x": `${drag}px`, "--drag-rotate": `${drag / 18}deg`, transform: "translateX(var(--drag-x)) rotate(var(--drag-rotate))", transition: dragging ? "none" : undefined };
  function loadMore() { setLoading(true); setError(""); setData(null); setLeaving(null); setDrag(0); setBatch(value => value + 1); }
  function useMyLocation() {
    manualLocation.current = false;
    seen.current = [];
    setLocationReady(false); setLocating(true); setLoading(true); setError(""); setData(null); setLeaving(null); setDrag(0);
    setLocationOpen(false); setLocationRevision(value => value + 1);
  }
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

  const locationDialog = (
    <Dialog open={locationOpen} onOpenChange={setLocationOpen} title="Where would you like to explore?" description="Choose any city. We’ll find real places around its centre.">
      <form key={`${destination.city}:${destination.country}`} className={styles.locationForm} onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); const city = String(fields.get("city") ?? "").trim(); const country = String(fields.get("country") ?? "").trim(); if (city.length < 2 || country.length < 2) return; locationController.current?.abort(); locationPending.current = false; manualLocation.current = true; seen.current = []; setLocationReady(true); setLocating(false); setLocationMessage(""); setLoading(true); setError(""); setData(null); setLeaving(null); setDrag(0); setDestination({ city, country }); setLocationOpen(false); }}>{nativeLocation && <Button type="button" variant="outline" disabled={locating} onClick={useMyLocation}><MapPin size={16} aria-hidden="true" />{locating ? "Finding your location…" : "Use my location"}</Button>}<label>City<input required minLength={2} maxLength={80} name="city" defaultValue={destination.city} autoComplete="address-level2" /></label><label>Country<input required minLength={2} maxLength={80} name="country" defaultValue={destination.country} autoComplete="country-name" /></label><Button type="submit">Show me places<ArrowRight size={16} aria-hidden="true" /></Button></form>
    </Dialog>
  );
  if (nativeApp) return <>
    <NativeDiscovery recipes={recipes} onOpenRecipe={onOpenRecipe} data={data} destination={destination} loading={loading} locating={locating} error={error} locationMessage={locationMessage} ownerId={ownerId} onLocation={() => setLocationOpen(true)} onReload={() => { seen.current = [...new Set([...seen.current, ...(data?.places.map(place => place.id) ?? [])])].slice(-60); loadMore(); }} onPlan={mode => onPlan(mode, destination)} onPlanPlace={onPlanNearby} onResume={onResume} onAuth={onAuth} onPlus={onPlus} />
    {locationDialog}
  </>;

  return <main className={styles.page}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>A PLACE. A POSSIBILITY.</span><h1>Where next?</h1></div><button className={styles.location} type="button" onClick={() => setLocationOpen(true)} aria-label={`Change destination, currently ${destination.city}, ${destination.country}`}><MapPin size={16} aria-hidden="true" /><span>{destination.city}</span><ChevronDown size={15} aria-hidden="true" /></button></header>
    <p className={styles.intro}>Find somewhere you’d love to go together.</p>
    {locationMessage && <p className={styles.locationMessage} role="status">{locationMessage}</p>}
    {nativeApp && <Button className={styles.planButton} onClick={() => onPlan()}>Plan a date<ArrowRight size={16} aria-hidden="true" /></Button>}
    <p className="sr-only" aria-live="polite" aria-atomic="true">{place ? `${place.name}. ${place.category}. Place ${index + 1} of ${data?.places.length}.` : !loading && !error ? "End of this collection. Find more places or change city." : ""}</p>
    <div className={styles.discovery} aria-busy={loading}>
      {loading ? <div className={styles.loading} role="status"><div className={styles.skeleton} aria-hidden="true" /><span>{!locationReady && nativeLocation ? "Finding your location…" : `Finding good places in ${destination.city}…`}</span></div> : error ? <div className={styles.empty}><MapPin size={32} aria-hidden="true" /><h2>A little connection hiccup.</h2><p role="alert">{error}</p><Button onClick={loadMore}>Try again<RotateCcw size={16} aria-hidden="true" /></Button><button type="button" className={styles.textButton} onClick={() => setLocationOpen(true)}>Choose another city</button></div> : place ? <>
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
    {!nativeApp && <button type="button" className={styles.plannerLink} onClick={() => onPlan()}>Have something in mind? Plan your date<ArrowRight size={15} aria-hidden="true" /></button>}
    {locationDialog}
    <Dialog open={details !== null} onOpenChange={open => { if (!open) setDetails(null); }} title={details?.name ?? "Place details"} description="A closer look before you plan.">
      {details && <div className={styles.details}><div className={styles.detailPhoto}><PlacePhoto key={details.id} place={details} /><PhotoCredit place={details} /></div><span className={styles.eyebrow}>{details.category}</span><h2>{details.name}</h2><p>{details.address}</p><div className={styles.detailFacts}>{details.details?.rating !== undefined && <span><Star size={17} aria-hidden="true" />{details.details.rating.toFixed(1)} on Google{details.details.reviewCount !== undefined ? ` · ${details.details.reviewCount.toLocaleString()} reviews` : ""}</span>}<span><MapPin size={17} aria-hidden="true" />{details.distanceKm.toFixed(1)} km from {destination.coordinates ? "your location" : `${destination.city} centre`}</span></div>{!!details.details?.hours.length && <details className={styles.hours}><summary>Opening hours</summary><ul>{details.details.hours.map(day => <li key={day}>{day}</li>)}</ul></details>}<p className={styles.detailNote}>We’ll check the date, time and your preferences in the planner. Confirm current prices and reservations with the venue.</p><Button onClick={() => onPlanNearby(details, destination)}>Plan nearby<ArrowRight size={16} aria-hidden="true" /></Button><a className={styles.sourceLink} href={details.mapsUrl} target="_blank" rel="noreferrer">See the place on Google Maps<ArrowUpRight size={16} aria-hidden="true" /></a>{details.attributions.map((source, i) => source.url ? <a className={styles.attribution} key={`${source.name}:${i}`} href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : <small key={`${source.name}:${i}`}>{source.name}</small>)}</div>}
    </Dialog>
  </main>;
}
