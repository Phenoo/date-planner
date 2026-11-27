"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { discoveryCategories, filterDiscoveryPlaces, type DiscoveryCategory } from "@/lib/maps/discovery-filters";
import type { CityDiscoveryResult } from "@/lib/maps/place-discovery";
import type { Coordinates } from "@/lib/maps/schema";
import { fallbackDateStory } from "@/lib/planner/date-story";
import { AtlasIcon, type AtlasIconName } from "./atlas-icon";
import { PlacePhoto, PhotoCredit, type DiscoveryPlace } from "./place-photo";
import type { PlannerMode } from "@/lib/planner/intake";
import type { SavedRecipe } from "@/lib/planner/saved";
import { NativeDateHero } from "./native-date-hero";
import { NativePlusCard } from "./native-app-ui";
import { useNativeWishlist } from "./use-native-wishlist";
import styles from "./native-discovery.module.css";
import appStyles from "./native-app.module.css";

type Destination = { city: string; country: string; coordinates?: Coordinates };
const categoryIcons: Record<DiscoveryCategory, AtlasIconName> = { "For you": "heart-tag", Dinner: "dinner", Playful: "dice", "Slow days": "coffee-date" };

export function NativeDiscovery({ recipes, onOpenRecipe, data, destination, loading, locating, error, locationMessage, ownerId, onLocation, onReload, onPlan, onPlanPlace, onAuth, onPlus, onResume }: {
  data: CityDiscoveryResult | null;
  destination: Destination;
  loading: boolean;
  locating: boolean;
  error: string;
  locationMessage: string;
  ownerId: string | null;
  onLocation: () => void;
  onReload: () => void;
  recipes: SavedRecipe[];
  onOpenRecipe: (recipe: SavedRecipe) => void;
  onPlan: (mode: PlannerMode) => void;
  onPlanPlace: (place: DiscoveryPlace, destination: Destination) => void;
  onAuth: () => void;
  onPlus: () => void;
  onResume?: () => void;
}) {
  const [category, setCategory] = useState<DiscoveryCategory>("For you");
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(50);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [details, setDetails] = useState<DiscoveryPlace | null>(null);
  const wishlist = useNativeWishlist(ownerId);
  const places = filterDiscoveryPlaces(data?.places ?? [], { category, query, radius });
  const idea = data?.places[0];
  const saved = (id: string) => wishlist.list?.entries.some(entry => entry.placeId === id) ?? false;
  function save(place: DiscoveryPlace) {
    if (!ownerId) { onAuth(); return; }
    void wishlist.toggle({ placeId: place.id, city: destination.city, country: destination.country });
  }
  function saveButton(place: DiscoveryPlace) {
    return <button type="button" className={styles.save} aria-pressed={saved(place.id)} aria-label={`${saved(place.id) ? "Unsave" : "Save"} ${place.name}`} disabled={Boolean(wishlist.saving) || Boolean(ownerId) && wishlist.loading} onClick={() => save(place)}><AtlasIcon name="heart" size={22} /></button>;
  }
  function mini(place: DiscoveryPlace) {
    return <article key={place.id} className={styles.mini}>
      <button type="button" onClick={() => setDetails(place)}><span className={styles.miniPhoto}><PlacePhoto place={place} /></span><span className={styles.miniCopy}><strong>{place.name}</strong><span>{place.category}</span><small>{place.distanceKm.toFixed(1)} km {destination.coordinates ? "from you" : "from city centre"}</small></span></button><div className={styles.miniCredit}><PhotoCredit place={place} /></div>
    </article>;
  }
  const story = details ? details.story ?? fallbackDateStory(details.category) : null;
  return <>
    <header className={styles.top}>
      <button type="button" className={styles.location} onClick={onLocation} aria-label={`Change destination, currently ${destination.city}, ${destination.country}`}>
        <span className={styles.locationPin}><AtlasIcon name="map-pin" size={20} /></span>
        <span><small>{destination.coordinates ? "Around you" : "Explore in"}</small><strong>{destination.city}, {destination.country}<AtlasIcon name="chevron-down" size={13} /></strong></span>
      </button>
      <Link href="/wishlist" aria-label="Open your wishlist"><AtlasIcon name="heart-tag" size={20} /></Link>
      <Link href="/saved" aria-label="Open your dates"><AtlasIcon name="date-book" size={20} /></Link>
    </header>
    <main className={styles.feed}>
      <div className={styles.intro}><p>Make time for each other</p><h1>Your next date,<br /><em>already taking shape.</em></h1></div>
      <NativeDateHero ownerId={ownerId} recipes={recipes} idea={idea} city={destination.city} onOpenRecipe={onOpenRecipe}
        saveButton={idea && saveButton(idea)} onIdea={() => { if (idea) setDetails(idea); }} onPlan={() => onPlan("steps")} onResume={onResume} />
      <div className={styles.quickActions}>
        <button type="button" onClick={() => onPlan("steps")}><AtlasIcon name="plan-note" /><strong>Plan something new</strong><small>Made around you two</small></button>
        <button type="button" onClick={() => onPlan("chat")}><AtlasIcon name="oge-face" /><strong>Ask Oge</strong><small>Talk it into a plan</small></button>
      </div>
      <NativePlusCard onOpen={onPlus} />
      <section className={styles.collection} aria-label="A little inspiration" aria-busy={loading}>
        <div className={styles.sectionHead}><h2>A little inspiration</h2><button type="button" onClick={() => setSearchOpen(true)}>See all<AtlasIcon name="arrow-right" size={15} /></button></div>
        <div className={styles.searchRow}><button type="button" className={styles.search} onClick={() => setSearchOpen(true)}><AtlasIcon name="search" size={18} />{query || "Search nearby date ideas"}</button><button type="button" className={styles.filters} aria-label="Filter date ideas" onClick={() => setFiltersOpen(true)}><AtlasIcon name="sliders-horizontal" size={20} /></button></div>
        {locationMessage && <button type="button" className={styles.locationNotice} onClick={onLocation}><AtlasIcon name="navigation" size={18} /><span>{locationMessage}</span></button>}
        {loading ? <div className={styles.skeleton} role="status"><AtlasIcon name="discover-map" size={32} /><p>{locating ? "Finding your location…" : `Finding places around ${destination.city}…`}</p></div>
          : error ? <div className={styles.empty}><p role="alert">{error}</p><button type="button" className={appStyles.primary} onClick={onReload}>Try again</button><button type="button" onClick={onLocation}>Choose another city</button></div>
          : places.length ? <div className={styles.grid}>{places.map(mini)}</div>
          : <div className={styles.empty}><AtlasIcon name="discover-map" size={32} /><h2>{data?.places.length ? "No matches this time." : "Looking a little further?"}</h2><p>{data?.places.length ? "Try another search or a wider distance." : `No nearby places with a confirmed Google rating above 3.75 in ${destination.city}.`}</p>{!!data?.places.length && <button type="button" onClick={() => { setCategory("For you"); setQuery(""); setRadius(50); }}>Clear filters</button>}<button type="button" onClick={onLocation}>Change city</button></div>}
      </section>
      {wishlist.error && <p className={styles.notice} role="alert">{wishlist.error}</p>}
      {!loading && !error && <button type="button" className={styles.more} onClick={onReload}>Find more places<AtlasIcon name="arrow-right" size={17} /></button>}
    </main>
    <Dialog open={searchOpen} onOpenChange={setSearchOpen} title="Find your kind of date" className={styles.searchDialog}>
      <h2>Find your kind of date</h2><label className="field"><span>Search this collection</span><input type="search" placeholder="Dinner, games, coffee…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className={styles.searchResults}>{places.map(place => <button type="button" key={place.id} onClick={() => { setSearchOpen(false); setDetails(place); }}><AtlasIcon name={categoryIcons[category]} /><span><strong>{place.name}</strong><small>{place.category} · {place.distanceKm.toFixed(1)} km</small></span><AtlasIcon name="chevron-right" size={16} /></button>)}</div>
      {!places.length && <p>No matching places in this collection. Try another search or change city.</p>}
      <button type="button" className={appStyles.primary} onClick={() => setSearchOpen(false)}>Show matches</button>
    </Dialog>
    <Dialog open={filtersOpen} onOpenChange={setFiltersOpen} title="Your kind of nearby" className={styles.searchDialog}>
      <h2>Your kind of nearby</h2><div className={styles.filterCategories}>{discoveryCategories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <label className="field"><span>Distance {destination.coordinates ? "from you" : "from city centre"} · Up to {radius} km</span><input type="range" min={1} max={50} value={radius} onChange={event => setRadius(Number(event.target.value))} /></label>
      <p>Only places with a confirmed Google rating above 3.75 appear here.</p><button type="button" className={appStyles.primary} onClick={() => setFiltersOpen(false)}>Show date ideas</button>
    </Dialog>
    <Dialog open={details !== null} onOpenChange={open => { if (!open) setDetails(null); }} title={details?.name ?? "Place details"} className={styles.detailDialog}>
      {details && story && <div className={styles.detailLayout}>
        <div className={styles.detailScroll}><div className={styles.detailHero}><PlacePhoto key={details.id} place={details} priority /><div className={styles.detailControls}><button type="button" className={appStyles.iconButton} onClick={() => setDetails(null)} aria-label="Go home"><AtlasIcon name="house" /></button>{saveButton(details)}</div><span className={styles.detailTag}>{details.category}</span><div className={styles.detailCredit}><PhotoCredit place={details} /></div></div>
          <div className={styles.detailBody}><h2>{details.name}</h2><p>{details.details?.description || details.reason || details.address}</p><div className={styles.facts}><div><AtlasIcon name="map-pin" /><strong>{details.distanceKm.toFixed(1)} km</strong><span>{destination.coordinates ? "From you" : "From city centre"}</span></div><div><AtlasIcon name="heart-tag" /><strong>{details.details?.rating?.toFixed(1) ?? "Listed"}</strong><span>Google rating</span></div><div><AtlasIcon name="users-round" /><strong>Time together</strong><span>Made around you</span></div></div><section><h3>Make a moment of it</h3><div className={styles.moments}>{story.moments.map((moment, index) => <div key={moment.title}><span>{index + 1}</span><div><h4>{moment.title}</h4><p>{moment.text}</p></div></div>)}</div></section>
          {!!details.details?.hours.length && <details className={styles.hours}><summary>Opening hours</summary>{details.details.hours.map(day => <p key={day}>{day}</p>)}</details>}
          <p className={styles.detailNote}>We’ll check your budget, timing and preferences in the planner. Confirm current prices and reservations with the venue.</p><a href={details.mapsUrl} target="_blank" rel="noreferrer" className={styles.mapsLink}>See the place on Google Maps<AtlasIcon name="arrow-up-right" size={17} /></a></div>
        </div>
        <footer className={styles.detailDock}><span><strong>Your kind of date.</strong><small>Plan around this place.</small></span><button type="button" className={appStyles.primary} onClick={() => { const place = details; setDetails(null); onPlanPlace(place, destination); }}>Plan this date</button></footer>
      </div>}
    </Dialog>
  </>;
}
