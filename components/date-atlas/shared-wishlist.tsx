"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onIdTokenChanged } from "firebase/auth";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getBrowserAuth } from "@/lib/firebase/client";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { draftJSON, plannerDraftKey } from "@/lib/planner/draft-retention";
import { plannerDraftVersion } from "@/lib/planner/questions";
import { currencyForCountry } from "@/lib/planner/currency";
import { requestSchema } from "@/lib/planner/schema";
import { wishlistLimit, wishlistPlaceSchema, wishlistResponseSchema, type WishlistEntry } from "@/lib/planner/shared-wishlist";
import styles from "./shared-wishlist.module.css";

type Wishlist = z.infer<typeof wishlistResponseSchema>;
type Place = z.infer<typeof wishlistPlaceSchema>;
type Search = { city: string; country: string; places: Place[] };
const searchSchema = z.object({ places: z.array(wishlistPlaceSchema).max(5) });

async function wishlistRequest(body: object, signal: AbortSignal, token?: string) {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...(token ? { token } : {}) }), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) };
  const response = await (token ? fetch("/api/wishlist", init) : plannerFetch("/api/wishlist", init));
  return readPlanningResponse(response, () => {});
}

export function SharedWishlist({ token }: { token?: string }) {
  const router = useRouter();
  const [list, setList] = useState<Wishlist | null>(null);
  const [search, setSearch] = useState<Search | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareLink, setShareLink] = useState<{ token: string; url: string } | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    function load() {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      void wishlistRequest({ action: "read" }, controller.signal, token).then((data) => {
        if (!controller.signal.aborted) setList(wishlistResponseSchema.parse(data));
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The wishlist couldn't be opened.");
      }).finally(() => {
        if (!controller.signal.aborted) { request.current = null; setBusy(false); }
      });
    }
    const auth = token ? null : getBrowserAuth();
    let unsubscribe: (() => void) | undefined;
    if (!auth) load();
    else {
      let owner: string | null | undefined;
      unsubscribe = onIdTokenChanged(auth, (user) => {
        const uid = user && !user.isAnonymous ? user.uid : null;
        if (owner === uid) return;
        owner = uid;
        request.current?.abort();
        request.current = null;
        setList(null); setSearch(null); setShareLink(null); setNotice("");
        setBusy(Boolean(uid)); setError(uid ? "" : "Sign in to open your shared wishlist.");
        if (uid) load();
      });
    }
    return () => { unsubscribe?.(); request.current?.abort(); };
  }, [token]);

  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setNotice("");
    try { await work(controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function readList(signal: AbortSignal) {
    const data = wishlistResponseSchema.parse(await wishlistRequest({ action: "read" }, signal, token));
    if (!signal.aborted) setList(data);
  }

  function mutate(body: object, success: string) {
    void run(async (signal) => {
      await wishlistRequest(body, signal, token);
      if (signal.aborted) return;
      setNotice(success);
      await readList(signal);
    });
  }

  function plan(entry: WishlistEntry) {
    if (!entry.place) return;
    void run(async (signal) => {
      const auth = getBrowserAuth();
      await auth?.authStateReady();
      if (signal.aborted) return;
      const flow = crypto.randomUUID();
      const preferences = requestSchema.parse({
        city: entry.city, currentCity: entry.city, area: entry.city, country: entry.country, locationScope: "city", maxDistance: 25,
        currency: currencyForCountry(entry.country) ?? "NGN", timeZoneConfirmed: false,
        occasion: "Romantic date", vibes: ["Romantic"], budget: null, durationMode: "estimated",
      });
      sessionStorage.setItem(plannerDraftKey, draftJSON({
        flow, ownerId: auth?.currentUser?.uid ?? null, version: plannerDraftVersion, request: preferences,
        selectedPlace: { id: entry.placeId, name: entry.place?.name.trim().slice(0, 200) || "Your wishlist venue" }, plannerMode: null, step: 0,
      }));
      router.push(`/plan?flow=${flow}`);
    });
  }

  async function share() {
    if (!list?.shareToken) return;
    const url = `${window.location.origin}/wishlist/${list.shareToken}`;
    setShareLink({ token: list.shareToken, url });
    try { await navigator.clipboard.writeText(url); setNotice("Wishlist link copied."); }
    catch { setNotice("Select the link below to copy it."); }
  }

  return <main className={styles.page}>
    <header>
      <Link href="/" className="atlas-wordmark" aria-label="A Date At las home">adal<span>.</span></Link>
      {!token && <Link href="/saved">My dates</Link>}
    </header>
    <h1>Shared wishlist</h1>
    {list && !list.exists && <>
      <p>Keep places you’d both like to try and pick one when you’re ready to plan.</p>
      <Button disabled={busy} onClick={() => mutate({ action: "create" }, "Your wishlist is ready.")}>Create shared wishlist</Button>
    </>}
    {!list && !busy && <>
      <Button variant="outline" onClick={() => void run(readList)}>Try again</Button>
      {!token && <Link href="/saved">Sign in through My dates</Link>}
    </>}
    {list?.exists && <>
      {!token && <section className={styles.section} aria-label="Wishlist sharing">
        <p>{list.shareToken ? "Anyone with the link can view and edit this list. Share it with your date." : "Sharing is off. Create a new link when you’re ready to invite someone."}</p>
        <div className={styles.actions}>
          {list.shareToken ? <Button disabled={busy} onClick={() => void share()}>Copy share link</Button> : <Button disabled={busy} onClick={() => mutate({ action: "enable" }, "A new share link is ready.")}>Enable sharing</Button>}
          {list.shareToken && <Button variant="outline" disabled={busy} onClick={() => { setShareLink(null); mutate({ action: "disable", token: list.shareToken }, "The old link is closed."); }}>Turn off sharing</Button>}
        </div>
        {shareLink && shareLink.token === list.shareToken && <label className="field"><span>Wishlist link</span><input readOnly value={shareLink.url} onFocus={(event) => event.currentTarget.select()} /></label>}
      </section>}
      <section className={styles.section} aria-labelledby="wishlist-saved">
        <div className={styles.actions}><h2 id="wishlist-saved">Saved places</h2><Button variant="ghost" disabled={busy} onClick={() => void run(readList)}>Refresh list</Button></div>
        {!list.entries.length && <p>Add the first place you’d like to try.</p>}
        {list.entries.length > 0 && <ul className={styles.places}>{list.entries.map((entry) => <li key={entry.placeId}>
          {entry.place ? <Venue place={entry.place} /> : <p>This saved venue’s details are unavailable.</p>}
          <div className={styles.actions}>
            {entry.place && <Button disabled={busy} onClick={() => plan(entry)}>Plan a date here</Button>}
            <Button variant="ghost" disabled={busy} aria-label={entry.place ? `Remove ${entry.place.name}` : "Remove unavailable venue"} onClick={() => mutate({ action: "remove", placeId: entry.placeId }, "Place removed.")}>Remove</Button>
          </div>
        </li>)}</ul>}
      </section>
      <section className={styles.section} aria-labelledby="wishlist-add">
        <h2 id="wishlist-add">Find a place to add</h2>
        {list.entries.length >= wishlistLimit ? <p>This list holds {wishlistLimit} places. Remove one to add another.</p> : <form className="form-stack" onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const city = String(fields.get("city") ?? "").trim();
          const country = String(fields.get("country") ?? "").trim();
          const query = String(fields.get("query") ?? "").trim();
          setSearch(null);
          void run(async (signal) => {
            const result = searchSchema.parse(await wishlistRequest({ action: "search", city, country, query }, signal, token));
            if (!signal.aborted) setSearch({ city, country, places: result.places });
          });
        }}>
          <label className="field"><span>Venue name or activity</span><input name="query" required minLength={2} maxLength={100} /></label>
          <label className="field"><span>City</span><input name="city" required minLength={2} maxLength={80} defaultValue={list.entries[0]?.city ?? ""} /></label>
          <label className="field"><span>Country</span><input name="country" required minLength={2} maxLength={80} defaultValue={list.entries[0]?.country ?? ""} /></label>
          <Button disabled={busy}>Search places</Button>
        </form>}
        {search && (search.places.length ? <ul className={styles.places}>{search.places.map((place) => {
          const saved = list.entries.some((entry) => entry.placeId === place.id);
          return <li key={place.id}><Venue place={place} /><Button variant="outline" disabled={busy || saved || list.entries.length >= wishlistLimit} aria-label={saved ? `${place.name} is saved` : `Save ${place.name}`} onClick={() => mutate({ action: "add", city: search.city, country: search.country, placeId: place.id }, "Place added to the wishlist.")}>{saved ? "Saved" : "Save place"}</Button></li>;
        })}</ul> : <p>No places found. Try another name or city.</p>)}
      </section>
    </>}
    <p role="status">{busy ? "Working on your wishlist…" : notice}</p>
    {error && <p className="error-message" role="alert">{error}</p>}
  </main>;
}

function Venue({ place }: { place: Place }) {
  return <>
    <h3>{place.name}</h3><p>{place.address || place.category}</p>
    <a href={place.mapsUrl} target="_blank" rel="noreferrer">View on Google Maps ↗</a>
    {place.attributions.map(({ name, url }, index) => <small key={`${name}:${index}`}>{url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : name}</small>)}
  </>;
}
