"use client";

import { useId, useState } from "react";
import { locationSettingsGuide, locationSettingsGuides } from "@/lib/maps/location-settings";
import styles from "./location-permission-help.module.css";

export function LocationPermissionHelp({ onRetry, disabled = false }: { onRetry: () => void; disabled?: boolean }) {
  const browserId = useId();
  const [selected, setSelected] = useState<ReturnType<typeof locationSettingsGuide> | null>(null);
  const guide = selected ?? locationSettingsGuides[0];

  return <details className={styles.help} onToggle={(event) => {
    if (event.currentTarget.open && !selected) setSelected(locationSettingsGuide(navigator.userAgent, navigator.maxTouchPoints));
  }}>
    <summary>Location settings</summary>
    <div className={styles.instructions}>
      <p>Your browser keeps this setting outside adal. Follow these steps, then come back here. Your answers stay in place.</p>
      <label htmlFor={browserId}>Your browser or device</label>
      <select id={browserId} value={guide.id} onChange={(event) => setSelected(locationSettingsGuides.find((option) => option.id === event.target.value) ?? locationSettingsGuides[0])}>
        {locationSettingsGuides.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <p>If you opened adal inside WhatsApp or another app, use that app’s menu to open this page in Safari or Chrome first.</p>
      {guide.helpUrl && <a href={guide.helpUrl} target="_blank" rel="noreferrer">Open the browser’s help guide ↗</a>}
      <button type="button" disabled={disabled} onClick={onRetry}>I’ve updated it — try my location</button>
      <p>You can also keep location off and choose your city manually.</p>
    </div>
  </details>;
}
