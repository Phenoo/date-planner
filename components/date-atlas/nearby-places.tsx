"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import Image from "next/image";
import { Layers2, LayoutGrid } from "lucide-react";
import type { NearbyResult } from "@/lib/maps/schema";
import { placeMapUrl } from "@/lib/maps/urls";
import { cardSwipeMotion, recordPlaceChoice, remainingPlaces, swipeDecision, type PlaceChoice, type PlaceDecision } from "@/lib/planner/place-deck";
import { Dialog } from "@/components/ui/dialog";
import { DateStoryView } from "./date-story-view";
import { fallbackDateStory } from "@/lib/planner/date-story";

type Place = NearbyResult["places"][number];
type Layout = "preview" | "stack" | "grid";
type Gesture = { pointer: number; x: number; y: number; width: number; deltaX: number; deltaY: number; moved: boolean };
type Departure = { place: Place; decision: PlaceDecision; focus: boolean; motion: ReturnType<typeof cardSwipeMotion> };
type Props = { initialResult: NearbyResult; onRefresh?: (excludeIds: string[], likedCategories: string[]) => Promise<void>; refreshing?: boolean; onPick?: (place: Place) => void };
const tones = ["rose", "lilac", "sunshine"] as const;
const gridPositions = ["calc(-150% - var(--deck-gap))", "-50%", "calc(50% + var(--deck-gap))"];
const stackPositions = ["translateX(-50%) translateY(0px) rotate(0deg) scale(1)", "translateX(calc(-50% + 12px)) translateY(14px) rotate(5deg) scale(.97)", "translateX(calc(-50% - 12px)) translateY(28px) rotate(-5deg) scale(.94)"];

function motionSubscription(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
function visibilitySubscription(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}

export function NearbyPlaces(props: Props) {
  return <PlaceDeck key={`${props.initialResult.country}:${props.initialResult.city}:${props.initialResult.area}`} {...props} initialResult={{ ...props.initialResult, places: props.initialResult.places.slice(0, 3) }} />;
}

function PlaceDeck({ initialResult: result, onRefresh, refreshing = false, onPick }: Props) {
  const [layout, setLayout] = useState<Layout>("preview");
  const [history, setHistory] = useState<PlaceChoice<Place>[]>([]);
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [inView, setInView] = useState(false);
  const [detail, setDetail] = useState<Place | null>(null);
  const [showKept, setShowKept] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const emptyHeading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pendingDecision = useRef<Departure | null>(null);
  const suppressClick = useRef<string | null>(null);
  const focusAfterDecision = useRef(false);
  const remainingTime = useRef(5000);
  const reduced = useSyncExternalStore(motionSubscription, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const pageVisible = useSyncExternalStore(visibilitySubscription, () => !document.hidden, () => true);
  const stacked = layout === "stack" || layout === "preview" && reduced;
  const previewing = layout === "preview" && !reduced;
  const browsing = layout === "grid";
  const running = inView && pageVisible && !detail && !showKept;
  const places = remainingPlaces(result.places, history);
  const kept = history.filter((choice) => choice.decision === "keep").map((choice) => choice.place);
  const displayed = browsing ? places : places.slice(0, 3);
  const currentIds = new Set(result.places.map((place) => place.id));
  const lastChoice = history.at(-1);
  const canUndo = !!lastChoice && currentIds.has(lastChoice.place.id);

  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= .25), { threshold: .25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!previewing || !running) return;
    const started = performance.now();
    const timer = window.setTimeout(() => setLayout("stack"), remainingTime.current);
    return () => {
      remainingTime.current = Math.max(0, remainingTime.current - (performance.now() - started));
      window.clearTimeout(timer);
    };
  }, [previewing, running]);
  const finishDecision = useCallback(() => {
    const pending = pendingDecision.current;
    if (!pending) return;
    pendingDecision.current = null;
    focusAfterDecision.current = pending.focus;
    setHistory((previous) => recordPlaceChoice(previous, pending.place, pending.decision));
    setDeparture(null);
    if (pending.decision === "keep") onPick?.(pending.place);
  }, [onPick]);
  useEffect(() => {
    if (!departure) return;
    // Finish even if the browser omits transitionend after a visibility change.
    const timer = window.setTimeout(finishDecision, 420);
    return () => window.clearTimeout(timer);
  }, [departure, finishDecision]);
  const nextId = places[0]?.id;
  useEffect(() => {
    if (!focusAfterDecision.current) return;
    focusAfterDecision.current = false;
    if (nextId) cards.current.get(nextId)?.focus({ preventScroll: true });
    else emptyHeading.current?.focus({ preventScroll: true });
  }, [nextId, history.length]);

  function getSwipeBounds(element?: HTMLElement) {
    const frame = board.current?.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const center = frame ? frame.left + frame.width / 2 : viewport / 2;
    return { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0, availableWidth: Math.max(0, 2 * Math.min(center, viewport - center)) };
  }
  function decide(decision: PlaceDecision, place = places[0], focus = false, deltaX = decision === "keep" ? 64 : -64) {
    if (!place || pendingDecision.current || refreshing) return;
    gesture.current = null;
    const element = cards.current.get(place.id);
    // Finish size transitions before measuring the card's swipe clearance.
    if (element) element.dataset.dragging = "true";
    const motion = cardSwipeMotion(deltaX, getSwipeBounds(element));
    if (element) delete element.dataset.dragging;
    const pending = { place, decision, focus: focus || places.length === 1, motion };
    pendingDecision.current = pending;
    if (reduced || !stacked) finishDecision();
    else setDeparture(pending);
  }
  function startDrag(event: PointerEvent<HTMLElement>, place: Place, index: number) {
    suppressClick.current = null;
    if (!stacked || index !== 0 || departure || refreshing || !event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest("a,button"))) return;
    event.currentTarget.dataset.dragging = "true";
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, width: event.currentTarget.offsetWidth, deltaX: 0, deltaY: 0, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.placeId = place.id;
  }
  function drag(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.deltaX = event.clientX - current.x;
    current.deltaY = event.clientY - current.y;
    if (!current.moved && Math.abs(current.deltaY) > 10 && Math.abs(current.deltaY) > Math.abs(current.deltaX)) {
      gesture.current = null;
      delete event.currentTarget.dataset.dragging;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!current.moved && Math.abs(current.deltaX) < 10) return;
    current.moved = true;
    const motion = cardSwipeMotion(current.deltaX, getSwipeBounds(event.currentTarget));
    event.currentTarget.style.transform = `translateX(calc(-50% + ${motion.x}px)) rotate(${motion.rotation}deg)`;
    event.currentTarget.dataset.swipe = current.deltaX > 0 ? "keep" : "skip";
    event.currentTarget.style.setProperty("--swipe-opacity", String(Math.min(1, Math.abs(current.deltaX) / 80)));
  }
  function finishDrag(event: PointerEvent<HTMLElement>, place: Place, canceled = false) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    gesture.current = null;
    delete event.currentTarget.dataset.dragging;
    delete event.currentTarget.dataset.swipe;
    event.currentTarget.style.removeProperty("--swipe-opacity");
    suppressClick.current = current.moved ? place.id : null;
    const decision = !canceled && current.moved ? swipeDecision(current.deltaX, current.deltaY, current.width) : null;
    if (decision) decide(decision, place, false, current.deltaX);
    else event.currentTarget.style.transform = stackPositions[0];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function refresh() {
    if (!onRefresh || refreshing || departure) return;
    const excluded = [...new Set([...history.map((choice) => choice.place.id), ...result.places.map((place) => place.id)])].slice(-60);
    await onRefresh(excluded, [...new Set(kept.map((place) => place.category))].slice(0, 12));
  }

  if (!result.places.length && !history.length) return null;
  const map = detail ? placeMapUrl(detail.id, process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY) : null;
  return <section className={`venue-deck ${stacked ? "venue-deck--stack" : "venue-deck--grid"} ${browsing ? "venue-deck--browse" : ""} ${reduced ? "venue-deck--still" : ""}`} aria-label="Your date ideas">
    <div className="venue-deck__toolbar">
      <span>{previewing ? `${result.places.length} POSSIBILITIES. YOUR KIND OF DATE.` : onPick ? "SWIPE LEFT TO SKIP. RIGHT TO PICK." : "SWIPE LEFT TO SKIP. RIGHT TO KEEP."}</span>
      <div className="deck-toolbar-actions">{!onPick && <button type="button" onClick={() => setShowKept((value) => !value)} aria-expanded={showKept}>Kept {kept.length}</button>}<button type="button" className="deck-view-toggle" aria-label={browsing ? "View as cards" : "View as grid"} title={browsing ? "View as cards" : "View as grid"} disabled={!!departure} onClick={() => setLayout(browsing ? "stack" : "grid")}>{browsing ? <Layers2 size={19} strokeWidth={1.7} aria-hidden="true" /> : <LayoutGrid size={19} strokeWidth={1.7} aria-hidden="true" />}</button></div>
    </div>
    {result.warnings?.map((warning) => <p key={warning} className="deck-warning" role="status">{warning}</p>)}
    {showKept && <section className="deck-shortlist" aria-label="Your kept places"><h2>Your little shortlist.</h2>{kept.length ? kept.map((place) => <div key={place.id}><button type="button" onClick={() => setDetail(place)}><strong>{place.name}</strong><small>{place.category}</small></button><button type="button" aria-label={`Remove ${place.name} from kept places`} onClick={() => setHistory((previous) => previous.filter((choice) => choice.place.id !== place.id))}>Remove</button></div>) : <p>Swipe right on a place you love. You’ll find it here.</p>}</section>}
    {previewing && places.length > 0 && <div className="deck-reveal-note"><span>A few of your ideas, coming together.</span><div className="deck-reveal-track" aria-hidden="true"><i style={{ animationPlayState: running ? "running" : "paused" }} /></div></div>}
    <div ref={board} className={`venue-deck__board venue-deck__board--${Math.min(places.length, 3)}`} onFocusCapture={() => { if (previewing) setLayout("grid"); }}>
      {!places.length && <div className="deck-finished"><span className="eyebrow">THAT’S THIS LITTLE ADVENTURE</span><h2 ref={emptyHeading} tabIndex={-1}>{kept.length ? `${kept.length} places caught your eye.` : "Something else might be more you."}</h2><p>{kept.length ? "Your kept places are in your shortlist. Explore a fresh set whenever you like." : "Let’s keep looking for your kind of together."}</p>{kept.length > 0 && <button type="button" className="button button-primary" onClick={() => setShowKept(true)}>See kept places</button>}{onRefresh && <button type="button" className="button button-outline" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Finding new ideas…" : "Find new ideas"}</button>}{history.some((choice) => choice.decision === "skip" && currentIds.has(choice.place.id)) && <button type="button" className="text-link" onClick={() => setHistory((previous) => previous.filter((choice) => choice.decision === "keep" || !currentIds.has(choice.place.id)))}>See skipped places again</button>}</div>}
      {displayed.map((place, index) => {
        const leaving = departure?.place.id === place.id;
        const transform = browsing ? "none" : leaving ? `translateX(calc(-50% + ${departure.motion.x}px)) rotate(${departure.motion.rotation}deg)` : stacked ? stackPositions[index] : `translateX(${displayed.length === 1 ? "-50%" : displayed.length === 2 ? index === 0 ? "calc(-100% - 12px)" : "12px" : gridPositions[index]})`;
        return <article key={place.id} ref={(element) => { if (element) cards.current.set(place.id, element); else cards.current.delete(place.id); }} className={`deck-card deck-card--${tones[result.places.findIndex((item) => item.id === place.id) % tones.length]} ${leaving ? "deck-card--leaving" : ""}`} role="group" aria-roledescription="date idea" aria-label={`${place.name}, ${index + 1} of ${places.length} remaining`} aria-hidden={stacked && index !== 0 ? true : undefined} inert={stacked && index !== 0} tabIndex={stacked && index === 0 ? 0 : -1}
          style={{ transform, zIndex: stacked ? displayed.length - index : 1 }}
          onTransitionEnd={(event) => { if (leaving && event.target === event.currentTarget && (event.propertyName === "transform" || event.propertyName === "opacity")) finishDecision(); }}
          onPointerDown={(event) => startDrag(event, place, index)} onPointerMove={drag} onPointerUp={(event) => finishDrag(event, place)} onPointerCancel={(event) => finishDrag(event, place, true)} onLostPointerCapture={(event) => finishDrag(event, place, true)}
          onClickCapture={(event) => { if (event.detail !== 0 && suppressClick.current === place.id) { event.preventDefault(); event.stopPropagation(); } suppressClick.current = null; }}
          onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); decide(event.key === "ArrowRight" ? "keep" : "skip", place, true); } if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetail(place); } }}>
          <span className="deck-swipe-stamp deck-swipe-stamp--keep" aria-hidden="true">{onPick ? "PICK" : "KEEP"}</span><span className="deck-swipe-stamp deck-swipe-stamp--skip" aria-hidden="true">SKIP</span>
          <div className="deck-card__topline"><span>A DATE AT LAS / A LITTLE POSSIBILITY</span><span>{result.city}</span></div>
          <PlaceImage key={place.photo?.url ?? place.id} place={place} />
          <div className="deck-card__body"><span className="deck-card__category">{place.category}</span><h2>{place.name}</h2><p>{place.reason}</p><button type="button" className="deck-card__cta" onClick={() => setDetail(place)}>Take a closer look<span aria-hidden="true">↗</span></button>{place.attributions.length > 0 && <small className="deck-provider-credit">{place.attributions.map((item, position) => item.url ? <a key={`${item.name}:${position}`} href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : <span key={`${item.name}:${position}`}>{item.name}</span>)}</small>}{browsing && <div className="deck-grid-decisions"><button type="button" disabled={refreshing} onClick={() => decide("skip", place)}>Skip</button><button type="button" disabled={refreshing} onClick={() => decide("keep", place)}>{onPick ? "Pick this place" : "Keep this place"}</button></div>}</div>
        </article>;
      })}
    </div>
    <div className="venue-deck__controls">
      {stacked && places.length > 0 ? <><button type="button" className="deck-decision deck-decision--skip" disabled={!!departure || refreshing} onClick={() => decide("skip")}>Skip <span aria-hidden="true">←</span></button><div><p role="status" aria-live="polite" aria-atomic="true">{places.length} <span>left</span></p>{!onPick && <small>{kept.length} kept</small>}</div><button type="button" className="deck-decision deck-decision--keep" disabled={!!departure || refreshing} onClick={() => decide("keep")}>{onPick ? "Pick this" : "Keep"} <span aria-hidden="true">→</span></button></> : places.length > 0 ? <span>{places.length} possibilities to explore.</span> : <span>Your choices. Your kind of together.</span>}
    </div>
    <div className="deck-secondary-actions"><button type="button" disabled={!canUndo || !!departure || refreshing} onClick={() => { focusAfterDecision.current = true; setHistory((previous) => previous.slice(0, -1)); }}>Undo last choice</button>{onRefresh && places.length > 0 && <button type="button" disabled={refreshing || !!departure} aria-busy={refreshing} onClick={() => void refresh()}>{refreshing ? "Finding new ideas…" : "Find fresh ideas"}</button>}</div>
    {places[0] && <DateStoryView story={places[0].story ?? fallbackDateStory(places[0].category)} label={`IMAGINE YOUR DATE AT ${places[0].name.toUpperCase()}`} />}
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }} title={detail?.name ?? "Your date idea"} description="Venue information and directions" className="place-detail-dialog">
      {detail && <><span className="eyebrow">A POSSIBILITY WORTH EXPLORING</span><h2>{detail.name}</h2><p className="place-detail-category">{detail.category} · {result.city}</p><p>{detail.reason}</p><p>{detail.address}</p>{map && <iframe title={`Google Map of ${detail.name}`} src={map} width="100%" height="260" style={{ border: 0 }} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}<a className="button button-primary" href={detail.mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps ↗</a><small>Costs and availability need confirmation with the venue.</small>{onPick && <button type="button" className="button button-primary" onClick={() => { if (detail) { setDetail(null); decide("keep", detail); } }}>Pick this place</button>}{detail.attributions.map((item, index) => <small key={`${item.name}:${index}`}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</small>)}</>}
    </Dialog>
  </section>;
}

function PlaceImage({ place }: { place: Place }) {
  const [failed, setFailed] = useState(false);
  return <div className={`deck-card__media ${!place.photo || failed ? "deck-card__media--graphic" : ""}`}>
    {place.photo && !failed ? <><Image src={place.photo.url} alt={`A view of ${place.name}`} fill unoptimized sizes="(max-width:700px) 85vw, 360px" draggable={false} onError={() => setFailed(true)} /><div className="deck-photo-credit">{place.photo.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}</div></> : <div className="deck-card__graphic" aria-hidden="true"><span>A DIFFERENT KIND<br />OF TOGETHER.</span><b>{place.name.charAt(0)}</b><i /></div>}
  </div>;
}
