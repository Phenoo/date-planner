"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { resolveLocation } from "@/lib/maps/client-location";
import type { DetectedLocation } from "@/lib/maps/schema";
import styles from "./chat-location-suggestion.module.css";

export function ChatLocationSuggestion({ disabled, onSelect, onManual }: {
  disabled: boolean; onSelect: (location: DetectedLocation["location"]) => void; onManual: () => void;
}) {
  const [detected, setDetected] = useState<DetectedLocation | null>(null);
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const session = useRef<{ active: boolean; version: number; controller: AbortController | null }>({ active: false, version: 0, controller: null });

  const locate = useCallback(() => {
    const current = session.current;
    if (!current.active || current.controller) return;
    if (!window.isSecureContext || !navigator.geolocation) { setMessage("Location unavailable."); return; }
    const abort = new AbortController();
    current.version++;
    current.controller = abort;
    setFinding(true); setMessage("");
    const finish = () => {
      if (!abort.signal.aborted) { current.controller = null; setFinding(false); }
    };
    try {
      navigator.geolocation.getCurrentPosition(async (position) => {
        if (abort.signal.aborted) return;
        try {
          const result = await resolveLocation({ lat: position.coords.latitude, lng: position.coords.longitude }, abort.signal);
          if (!abort.signal.aborted) setDetected(result);
        } catch {
          if (!abort.signal.aborted) setMessage("Couldn’t find your location.");
        } finally { finish(); }
      }, (failure) => {
        if (abort.signal.aborted) return;
        setMessage(failure.code === 3 ? "Location lookup timed out." : "Location unavailable.");
        finish();
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    } catch {
      setMessage("Location unavailable.");
      finish();
    }
  }, []);

  useEffect(() => {
    const current = session.current;
    current.active = true;
    const version = current.version;
    if (navigator.permissions?.query) void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (current.active && current.version === version && permission.state === "granted") locate();
    }).catch(() => {});
    return () => { current.active = false; current.version++; current.controller?.abort(); current.controller = null; };
  }, [locate]);

  if (dismissed) return null;
  return <section className={styles.location} aria-label="Location suggestion" aria-busy={finding}>
    {detected ? <>
      <p role="status">It looks like you’re in <strong>{detected.location.city}, {detected.location.country}</strong>. Shall we plan there?</p>
      <div className={styles.actions}>
        <button type="button" disabled={disabled} onClick={() => onSelect(detected.location)}>Plan in {detected.location.city}</button>
        <button type="button" disabled={disabled} onClick={() => { setDismissed(true); onManual(); }}>Choose another city</button>
      </div>
    </> : <button className={styles.locate} type="button" disabled={disabled || finding} onClick={locate}><MapPin size={16} aria-hidden="true" />{finding ? "Finding your city…" : "Use my location"}</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
