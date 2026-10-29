"use client";

import { useEffect, useState } from "react";
import { citySuggestionsSchema, type CitySuggestions } from "@/lib/maps/cities";
import styles from "./nearby-cities.module.css";

type State = { status: "loading" } | { status: "ready"; data: CitySuggestions } | { status: "error" };

export function NearbyCities({ city, country, selectedCity, onSelect }: { city: string; country: string; selectedCity: string; onSelect: (city: string) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/cities", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, country }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw new Error("City suggestions unavailable");
        const data = citySuggestionsSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", data });
      } catch { if (!controller.signal.aborted) setState({ status: "error" }); }
    }
    void load();
    return () => controller.abort();
  }, [city, country, attempt]);

  return <section className={styles.suggestions} aria-label="Nearby city suggestions" aria-busy={state.status === "loading"}>
    <p className={styles.heading}>A little further from {city}</p>
    {state.status === "loading" && <p role="status">Finding nearby cities…</p>}
    {state.status === "error" && <p role="status">Nearby suggestions are unavailable. Type any destination above, or <button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>try again</button>.</p>}
    {state.status === "ready" && (state.data.cities.length ? <>
      <div className={styles.options}>{state.data.cities.map((suggestion) => <button type="button" key={suggestion.id} className={`filter-pill ${selectedCity === suggestion.name ? "active" : ""}`} aria-pressed={selectedCity === suggestion.name} onClick={() => onSelect(suggestion.name)}>
        <span>{suggestion.name}</span><small>About {suggestion.distanceKm} km</small>
      </button>)}</div>
      <p className={styles.caption}>25–250 km from the city center. Distances are straight-line estimates.</p>
      <p className={styles.caption}>City data: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
    </> : <p role="status">We couldn&apos;t find another city within 250 km. You can type any destination above.</p>)}
  </section>;
}
