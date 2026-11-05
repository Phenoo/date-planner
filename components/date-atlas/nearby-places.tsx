"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import Image from "next/image";
import { Layers2, LayoutGrid } from "lucide-react";
import type { NearbyResult } from "@/lib/maps/schema";
import { placeMapUrl } from "@/lib/maps/urls";
import { cardSwipeMotion, rotatePlaceDeck, swipeDirection, type PlaceDirection } from "@/lib/planner/place-deck";
import { Dialog } from "@/components/ui/dialog";
import { DateStoryView } from "./date-story-view";
import { fallbackDateStory } from "@/lib/planner/date-story";

type Place = NearbyResult["places"][number];
type Layout = "preview" | "stack" | "grid";
type Gesture = { pointer: number; x: number; y: number; width: number; deltaX: number; deltaY: number; moved: boolean };
type Departure = { place: Place; direction: PlaceDirection; focus: boolean; motion: ReturnType<typeof cardSwipeMotion> };
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
  return <PlaceDeck key={`${props.initialResult.country}:${props.initialResult.city}:${props.initialResult.area}:${props.initialResult.places.map((place) => place.id).join(",")}`} {...props} initialResult={{ ...props.initialResult, places: props.initialResult.places.slice(0, 3) }} />;
}

function PlaceDeck({ initialResult: result, onRefresh, refreshing = false, onPick }: Props) {
  const [layout, setLayout] = useState<Layout>("preview");
  const [position, setPosition] = useState(0);
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [inView, setInView] = useState(false);
  const [detail, setDetail] = useState<Place | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const gesture = useRef<Gesture | null>(null);
  const pendingNavigation = useRef<Departure | null>(null);
  const suppressClick = useRef<string | null>(null);
  const focusAfterNavigation = useRef(false);
  const remainingTime = useRef(5000);
  const reduced = useSyncExternalStore(motionSubscription, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  const pageVisible = useSyncExternalStore(visibilitySubscription, () => !document.hidden, () => true);
  const stacked = layout === "stack" || layout === "preview" && reduced;
  const previewing = layout === "preview" && !reduced;
  const browsing = layout === "grid";
  const running = inView && pageVisible && !detail;
  const places = rotatePlaceDeck(result.places, position);
  const displayed = browsing ? places : places.slice(0, 3);
  const activeIndex = result.places.findIndex((place) => place.id === places[0]?.id);

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
  const finishNavigation = useCallback(() => {
    const pending = pendingNavigation.current;
    if (!pending) return;
    pendingNavigation.current = null;
    focusAfterNavigation.current = pending.focus;
    setPosition((previous) => previous + (pending.direction === "next" ? 1 : -1));
    setDeparture(null);
  }, []);
  useEffect(() => {
    if (!departure) return;
    // Finish even if the browser omits transitionend after a visibility change.
    const timer = window.setTimeout(finishNavigation, 420);
    return () => window.clearTimeout(timer);
  }, [departure, finishNavigation]);
  const nextId = places[0]?.id;
  useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    if (nextId) cards.current.get(nextId)?.focus({ preventScroll: true });
  }, [nextId]);

  function getSwipeBounds(element?: HTMLElement) {
    const frame = board.current?.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const center = frame ? frame.left + frame.width / 2 : viewport / 2;
    return { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0, availableWidth: Math.max(0, 2 * Math.min(center, viewport - center)) };
  }
  function navigate(direction: PlaceDirection, focus = false, deltaX = direction === "next" ? -64 : 64) {
    const place = places[0];
    if (!place || places.length < 2 || pendingNavigation.current || refreshing) return;
    gesture.current = null;
    const element = cards.current.get(place.id);
    // Finish size transitions before measuring the card's swipe clearance.
    if (element) element.dataset.dragging = "true";
    const motion = cardSwipeMotion(deltaX, getSwipeBounds(element));
    if (element) delete element.dataset.dragging;
    const pending = { place, direction, focus, motion };
    pendingNavigation.current = pending;
    if (reduced || !stacked) finishNavigation();
    else setDeparture(pending);
  }
  function startDrag(event: PointerEvent<HTMLElement>, place: Place, index: number) {
    suppressClick.current = null;
    if (!stacked || places.length < 2 || index !== 0 || departure || refreshing || !event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest("a,button"))) return;
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
    event.currentTarget.dataset.swipe = current.deltaX < 0 ? "next" : "previous";
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
    const direction = !canceled && current.moved ? swipeDirection(current.deltaX, current.deltaY, current.width) : null;
    if (direction) navigate(direction, false, current.deltaX);
    else event.currentTarget.style.transform = stackPositions[0];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function refresh() {
    if (!onRefresh || refreshing || departure) return;
    await onRefresh(result.places.map((place) => place.id), []);
  }

  if (!result.places.length) return null;
  const map = detail ? placeMapUrl(detail.id, process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY) : null;
  return <section className={`venue-deck ${stacked ? "venue-deck--stack" : "venue-deck--grid"} ${browsing ? "venue-deck--browse" : ""} ${reduced ? "venue-deck--still" : ""}`} aria-label="Your date ideas">
    <div className="venue-deck__toolbar">
      <span>{previewing ? `${result.places.length} POSSIBILITIES. YOUR KIND OF DATE.` : "SWIPE TO EXPLORE. EVERY IDEA STAYS."}</span>
      <div className="deck-toolbar-actions"><button type="button" className="deck-view-toggle" aria-label={browsing ? "View as cards" : "View as grid"} title={browsing ? "View as cards" : "View as grid"} disabled={!!departure} onClick={() => setLayout(browsing ? "stack" : "grid")}>{browsing ? <Layers2 size={19} strokeWidth={1.7} aria-hidden="true" /> : <LayoutGrid size={19} strokeWidth={1.7} aria-hidden="true" />}</button></div>
    </div>
    {result.warnings?.map((warning) => <p key={warning} className="deck-warning" role="status">{warning}</p>)}
    {previewing && places.length > 0 && <div className="deck-reveal-note"><span>A few of your ideas, coming together.</span><div className="deck-reveal-track" aria-hidden="true"><i style={{ animationPlayState: running ? "running" : "paused" }} /></div></div>}
    <div ref={board} className={`venue-deck__board venue-deck__board--${Math.min(places.length, 3)}`} onFocusCapture={() => { if (previewing) setLayout("grid"); }}>
      {displayed.map((place, index) => {
        const leaving = departure?.place.id === place.id;
        const transform = browsing ? "none" : leaving ? `translateX(calc(-50% + ${departure.motion.x}px)) rotate(${departure.motion.rotation}deg)` : stacked ? stackPositions[index] : `translateX(${displayed.length === 1 ? "-50%" : displayed.length === 2 ? index === 0 ? "calc(-100% - 12px)" : "12px" : gridPositions[index]})`;
        return <article key={place.id} ref={(element) => { if (element) cards.current.set(place.id, element); else cards.current.delete(place.id); }} className={`deck-card deck-card--${tones[result.places.findIndex((item) => item.id === place.id) % tones.length]} ${leaving ? "deck-card--leaving" : ""}`} role="group" aria-roledescription="date idea" aria-label={`${place.name}, ${result.places.findIndex((item) => item.id === place.id) + 1} of ${places.length}`} aria-hidden={stacked && index !== 0 ? true : undefined} inert={stacked && index !== 0} tabIndex={stacked && index === 0 ? 0 : -1}
          style={{ transform, zIndex: stacked ? displayed.length - index : 1 }}
          onTransitionEnd={(event) => { if (leaving && event.target === event.currentTarget && (event.propertyName === "transform" || event.propertyName === "opacity")) finishNavigation(); }}
          onPointerDown={(event) => startDrag(event, place, index)} onPointerMove={drag} onPointerUp={(event) => finishDrag(event, place)} onPointerCancel={(event) => finishDrag(event, place, true)} onLostPointerCapture={(event) => finishDrag(event, place, true)}
          onClickCapture={(event) => { if (event.detail !== 0 && suppressClick.current === place.id) { event.preventDefault(); event.stopPropagation(); } suppressClick.current = null; }}
          onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); navigate(event.key === "ArrowRight" ? "next" : "previous", true); } if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetail(place); } }}>
          <span className="deck-swipe-stamp deck-swipe-stamp--next" aria-hidden="true">NEXT</span><span className="deck-swipe-stamp deck-swipe-stamp--previous" aria-hidden="true">PREVIOUS</span>
          <div className="deck-card__topline"><span>A DATE AT LAS / A LITTLE POSSIBILITY</span><span>{result.city}</span></div>
          <PlaceImage key={place.photo?.url ?? place.id} place={place} />
          <div className="deck-card__body"><span className="deck-card__category">{place.category}</span><h2>{place.name}</h2><p>{place.reason}</p><button type="button" className="deck-card__cta" onClick={() => setDetail(place)}>Take a closer look<span aria-hidden="true">↗</span></button>{place.attributions.length > 0 && <small className="deck-provider-credit">{place.attributions.map((item, position) => item.url ? <a key={`${item.name}:${position}`} href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : <span key={`${item.name}:${position}`}>{item.name}</span>)}</small>}{browsing && onPick && <div className="deck-grid-decisions"><button type="button" disabled={refreshing} onClick={() => onPick(place)}>Pick this place</button></div>}</div>
        </article>;
      })}
    </div>
    <div className="venue-deck__controls">
      {stacked ? <><button type="button" className="deck-decision deck-decision--previous" disabled={places.length < 2 || !!departure || refreshing} onClick={() => navigate("previous")}>← <span>Previous</span></button><p role="status" aria-live="polite" aria-atomic="true">{activeIndex + 1} <span>of {places.length}</span></p><button type="button" className="deck-decision deck-decision--next" disabled={places.length < 2 || !!departure || refreshing} onClick={() => navigate("next")}><span>Next</span> →</button></> : <span>{places.length} possibilities to explore.</span>}
    </div>
    {stacked && onPick && <div className="deck-pick-action"><button type="button" className="button button-primary" disabled={refreshing || !!departure} onClick={() => onPick(places[0])}>Pick this place</button></div>}
    {onRefresh && <div className="deck-secondary-actions"><button type="button" disabled={refreshing || !!departure} aria-busy={refreshing} onClick={() => void refresh()}>{refreshing ? "Finding new ideas…" : "Find fresh ideas"}</button></div>}
    {places[0] && <DateStoryView story={places[0].story ?? fallbackDateStory(places[0].category)} label={`IMAGINE YOUR DATE AT ${places[0].name.toUpperCase()}`} />}
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }} title={detail?.name ?? "Your date idea"} description="Venue information and directions" className="place-detail-dialog">
      {detail && <><span className="eyebrow">A POSSIBILITY WORTH EXPLORING</span><h2>{detail.name}</h2><p className="place-detail-category">{detail.category} · {result.city}</p><p>{detail.reason}</p><p>{detail.address}</p>{map && <iframe title={`Google Map of ${detail.name}`} src={map} width="100%" height="260" style={{ border: 0 }} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}<a className="button button-primary" href={detail.mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps ↗</a><small>Costs and availability need confirmation with the venue.</small>{onPick && <button type="button" className="button button-primary" onClick={() => { setDetail(null); onPick(detail); }}>Pick this place</button>}{detail.attributions.map((item, index) => <small key={`${item.name}:${index}`}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</small>)}</>}
    </Dialog>
  </section>;
}

function PlaceImage({ place }: { place: Place }) {
  const [failed, setFailed] = useState(false);
  return <div className={`deck-card__media ${!place.photo || failed ? "deck-card__media--graphic" : ""}`}>
    {place.photo && !failed ? <><Image src={place.photo.url} alt={`A view of ${place.name}`} fill unoptimized sizes="(max-width:700px) 85vw, 360px" draggable={false} onError={() => setFailed(true)} /><div className="deck-photo-credit">{place.photo.authors.map((author, index) => author.url ? <a key={`${author.name}:${index}`} href={author.url} target="_blank" rel="noreferrer">Photo: {author.name}</a> : <span key={`${author.name}:${index}`}>Photo: {author.name}</span>)}</div></> : <div className="deck-card__graphic" aria-hidden="true"><span>A DIFFERENT KIND<br />OF TOGETHER.</span><b>{place.name.charAt(0)}</b><i /></div>}
  </div>;
}
