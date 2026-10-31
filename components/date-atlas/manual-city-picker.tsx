"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Field } from "@/components/ui/field";
import { countryCitiesSchema, manualCitySuggestions, type CountryCities } from "@/lib/maps/cities";
import type { Coordinates } from "@/lib/maps/schema";
import { browserLocationError } from "@/lib/maps/client-location";
import styles from "./nearby-cities.module.css";

type State = { key: string; status: "ready"; data: CountryCities } | { key: string; status: "error" };

export function ManualCityPicker({ country, city, countryHint, onCountryChange, onCityChange, onSelect }: {
  country: string; city: string; countryHint?: string; onCountryChange: (country: string) => void; onCityChange: (city: string) => void; onSelect: (city: string) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [countries, setCountries] = useState<CountryCities["countries"]>([]);
  const [attempt, setAttempt] = useState(0);
  const [origin, setOrigin] = useState<Coordinates>();
  const [finding, setFinding] = useState(false);
  const [geoMessage, setGeoMessage] = useState("");
  const geoSession = useRef({ active: false, version: 0, pending: false });
  const cityInput = useRef<HTMLInputElement>(null);
  const countryDetails = useRef<HTMLDetailsElement>(null);
  const firstSuggestion = useRef<HTMLButtonElement>(null);
  const key = `${country.trim()}:${attempt}`;
  const data = state?.key === key && state.status === "ready" ? state.data : null;
  const failed = state?.key === key && state.status === "error";

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities?${new URLSearchParams({ country: country.trim() })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error("City suggestions unavailable");
        const result = countryCitiesSchema.parse(await response.json());
        if (!controller.signal.aborted) { setCountries(result.countries); setState({ key, status: "ready", data: result }); }
      } catch { if (!controller.signal.aborted) setState({ key, status: "error" }); }
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [country, key]);

  const locate = useCallback((quiet = false) => {
    if (!window.isSecureContext || !navigator.geolocation) { if (!quiet) setGeoMessage("Location isn't available here. You can still choose a country and type your city."); return; }
    const session = geoSession.current;
    if (session.pending) return;
    const version = ++session.version;
    session.pending = true;
    setFinding(true); setGeoMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (!session.active || version !== session.version) return;
      // Keep device coordinates in this component only; country city data is public.
      setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
      session.pending = false; setFinding(false);
    }, (failure) => {
      if (!session.active || version !== session.version) return;
      session.pending = false; setFinding(false);
      if (!quiet) setGeoMessage(browserLocationError(failure.code));
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }, []);

  useEffect(() => {
    const session = geoSession.current;
    session.active = true;
    const version = session.version;
    if (navigator.permissions) void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (session.active && version === session.version && permission.state === "granted") locate(true);
    }).catch(() => {});
    return () => { session.active = false; session.version++; session.pending = false; };
  }, [locate]);

  const suggestions = data?.country ? manualCitySuggestions(data.cities, data.country.code, city, origin) : [];
  function countryKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault(); event.stopPropagation();
    const value = event.currentTarget.value.trim().toLowerCase();
    const matches = countries.filter((item) => item.name.toLowerCase().startsWith(value));
    const match = countries.find((item) => item.name.toLowerCase() === value || item.code.toLowerCase() === value) ?? (country.trim().toLowerCase() === value ? data?.country : null) ?? (value && matches.length === 1 ? matches[0] : null);
    if (match) {
      if (!data?.country || country.trim().toLowerCase() !== value) onCountryChange(match.name);
      if (countryDetails.current) countryDetails.current.open = false;
      cityInput.current?.focus();
    }
  }
  function cityKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault(); event.stopPropagation(); firstSuggestion.current?.focus();
    }
    if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      const value = event.currentTarget.value.trim().toLowerCase();
      const exact = data?.cities.find(([, name]) => name.toLowerCase() === value);
      const match = exact?.[1] ?? (suggestions.length === 1 && suggestions[0].name.toLowerCase().includes(value) ? suggestions[0].name : null);
      if (match) onSelect(match);
    }
  }
  return <>
    <details ref={countryDetails} className={styles.country}><summary>{country || "Choose country"}<span>· Change</span></summary><Field label="Country" hint={countryHint}><input value={country} list="atlas-manual-countries" maxLength={80} autoComplete="country-name" onKeyDown={countryKey} onChange={(event) => onCountryChange(event.target.value)} placeholder="Choose your country…" /><datalist id="atlas-manual-countries">{countries.map((item) => <option key={item.code} value={item.name} />)}</datalist></Field></details>
    <Field label="Your current city"><input ref={cityInput} value={city} list="atlas-manual-cities" maxLength={80} autoComplete="address-level2" onKeyDown={cityKey} onChange={(event) => onCityChange(event.target.value)} placeholder="Type your city…" /><datalist id="atlas-manual-cities">{data?.cities.map(([id, name]) => <option key={id} value={name} />)}</datalist></Field>
    <section className={styles.suggestions} aria-label="City suggestions for your country" aria-busy={!data && !failed}>
      <button type="button" className={styles.locate} disabled={finding} onClick={() => locate()}>{finding ? "Finding nearby cities…" : origin ? "Refresh nearby cities" : "Suggest cities near me"}</button>
      {geoMessage && <p role="status">{geoMessage}</p>}
      {!data && !failed && <p role="status">Finding cities in your country…</p>}
      {failed && <p role="status">City suggestions are unavailable. You can type your city, or <button type="button" onClick={() => setAttempt((value) => value + 1)}>try again</button>.</p>}
      {data && !data.country && <p role="status">Choose a country to see its cities. You can also type your city directly.</p>}
      {data?.country && <>
        <p className={styles.heading}>{origin ? "Closest cities" : "Cities"} in {data.country.name}</p>
        {suggestions.length ? <div className={styles.options}>{suggestions.map((item, index) => <button ref={index === 0 ? firstSuggestion : undefined} type="button" key={item.id} className={`filter-pill ${city === item.name ? "active" : ""}`} aria-pressed={city === item.name} onClick={() => onSelect(item.name)}><span>{item.name}</span>{item.distanceKm !== undefined && <small>About {item.distanceKm} km away</small>}</button>)}</div> : <p role="status">No matching city in this list. You can still type your city above.</p>}
        <p className={styles.caption}>{origin && "Distances are straight-line estimates. "}City data: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
      </>}
    </section>
  </>;
}
