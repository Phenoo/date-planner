"use client";

import { useEffect, useId, useRef, useState } from "react";
import Script from "next/script";
import { ArrowUpRight, Camera } from "lucide-react";
import { instagramProfileUrl } from "@/lib/maps/instagram";
import styles from "./venue-instagram.module.css";

function processInstagramPreview() {
  const instagram: unknown = Reflect.get(window, "instgrm");
  if (!instagram || typeof instagram !== "object" || !("Embeds" in instagram)) return false;
  const embeds = instagram.Embeds;
  if (!embeds || typeof embeds !== "object" || !("process" in embeds) || typeof embeds.process !== "function") return false;
  try { embeds.process(); return true; }
  catch { return false; }
}

function InstagramProfilePreview({ profile }: { profile: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const id = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  return <section className={styles.section} aria-label="Venue Instagram">
    <div className={styles.heading}>
      <h3>On Instagram</h3>
      <a href={profile} target="_blank" rel="noopener noreferrer"><Camera size={16} aria-hidden="true" />View profile<ArrowUpRight size={16} aria-hidden="true" /></a>
    </div>
    <p>Take a look at the venue on Instagram.</p>
    <button type="button" className={styles.toggle} aria-expanded={showPreview} aria-controls={showPreview ? id : undefined} onClick={() => { setFailed(false); setShowPreview((previous) => !previous); }}>{showPreview ? "Hide Instagram preview" : "Show Instagram preview"}</button>
    {showPreview && <div className={styles.preview} id={id}>
      <div className={styles.embed}>
        <blockquote className="instagram-media" data-instgrm-permalink={profile} data-instgrm-version="14">
          <a href={profile} target="_blank" rel="noopener noreferrer">View this profile on Instagram</a>
        </blockquote>
      </div>
      <Script id="date-atlas-instagram-embed" src="https://www.instagram.com/embed.js" strategy="afterInteractive" onReady={() => { if (!processInstagramPreview() && mounted.current) setFailed(true); }} onError={() => { if (mounted.current) setFailed(true); }} />
      <p className={styles.fallback} role={failed ? "status" : undefined}>{failed ? "The Instagram preview is unavailable. You can still open the profile above." : "If the preview is unavailable, open the profile on Instagram."}</p>
    </div>}
  </section>;
}

export function VenueInstagram({ url }: { url: string }) {
  const profile = instagramProfileUrl(url);
  return profile ? <InstagramProfilePreview key={profile} profile={profile} /> : null;
}
