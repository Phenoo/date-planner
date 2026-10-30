"use client";
import { useEffect, useState } from "react";
import type { NearbyResult } from "@/lib/maps/schema";
import type { PlanRequest } from "@/lib/planner/schema";
import { CinematicReveal } from "./cinematic-reveal";
import { ChosenDateReveal } from "./chosen-date-reveal";
import { activeDiscoveryKey, invitationReturnKey } from "@/lib/planner/discovery-session";

import type { RejectionReason } from "./rejection-dialog";
export function SinglePlaceJourney({ place, sessionId, request, signedIn, accountRevision, busy, error, rejected, onReject, onCancelGeneration, onEdit, onTiming, onSignIn }: {
  place: NearbyResult["places"][number]; sessionId?: string; request: PlanRequest; signedIn: boolean; accountRevision: string;
  onCancelGeneration?: () => void; busy: boolean; error: string; rejected: boolean; onReject: (reason: RejectionReason) => void; onEdit: () => void; onTiming: () => void; onSignIn: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [returning, setReturning] = useState(false);
  const key = `date-atlas:accepted-pick:${sessionId ?? place.id}`;
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { try { if (active && sessionStorage.getItem(key) === place.id) setAccepted(true); } catch { /* The date remains usable without browser storage. */ } });
    return () => { active = false; };
  }, [key, place.id]);
  function accept() {
    try {
      sessionStorage.setItem(key, place.id);
      const raw: unknown = JSON.parse(sessionStorage.getItem(activeDiscoveryKey) || "null");
      if (raw && typeof raw === "object") sessionStorage.setItem(activeDiscoveryKey, JSON.stringify({ ...raw, accepted: true }));
    } catch { /* The current choice is kept in memory. */ }
    setAccepted(true);
    window.scrollTo({ top: 0 });
  }
  function signIn() {
    try {
      if (sessionId) localStorage.setItem(invitationReturnKey, JSON.stringify({ flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", sessionId, placeId: place.id, expiresAt: Date.now() + 3600000 }));
    } catch { /* The current tab still preserves the accepted date. */ }
    onSignIn();
  }
  if (accepted) return <ChosenDateReveal key={`${place.id}:${accountRevision}`} place={place} sessionId={sessionId} request={request} signedIn={signedIn} onSignIn={signIn} onTiming={onTiming} onChange={() => { try { sessionStorage.removeItem(key); } catch { /* The current choice can still change. */ } setAccepted(false); setReturning(true); window.scrollTo({ top: 0 }); }} />;
  return <CinematicReveal onCancelGeneration={onCancelGeneration} place={place} request={request} busy={busy} error={error} rejected={rejected} initialChapter={returning ? 5 : 0} onAccept={accept} onReject={onReject} onEdit={onEdit} onTiming={onTiming} />;
}
