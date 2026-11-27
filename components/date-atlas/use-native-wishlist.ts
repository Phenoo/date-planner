"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { getBrowserAuth, hasPendingAccountTransfer } from "@/lib/firebase/client";
import { plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { wishlistResponseSchema, type WishlistEntry } from "@/lib/planner/shared-wishlist";

type Wishlist = z.infer<typeof wishlistResponseSchema>;
type State = { ownerId: string | null; list: Wishlist | null; loading: boolean; error: string };

async function request(body: object, signal: AbortSignal) {
  return readPlanningResponse(await plannerFetch("/api/wishlist", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  }), () => {});
}

export function useNativeWishlist(ownerId: string | null) {
  const [state, setState] = useState<State>({ ownerId, list: null, loading: Boolean(ownerId), error: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const currentOwner = useRef(ownerId);
  useEffect(() => {
    mounted.current = true;
    currentOwner.current = ownerId;
    const controller = new AbortController();
    const active = () => !controller.signal.aborted && currentOwner.current === ownerId && (!ownerId || getBrowserAuth()?.currentUser?.uid === ownerId && !hasPendingAccountTransfer());
    void Promise.resolve().then(async () => {
      if (!active()) return;
      setState({ ownerId, list: null, loading: Boolean(ownerId), error: "" });
      setSaving(null);
      if (!ownerId) return;
      try {
        const list = wishlistResponseSchema.parse(await request({ action: "read" }, controller.signal));
        if (active()) setState({ ownerId, list, loading: false, error: "" });
      } catch (failure) {
        if (active()) setState({ ownerId, list: null, loading: false, error: failure instanceof Error ? failure.message : "Your wishlist couldn't be loaded." });
      }
    });
    return () => { mounted.current = false; controller.abort(); mutation.current?.abort(); mutation.current = null; };
  }, [ownerId]);
  const visible = state.ownerId === ownerId ? state : { ownerId, list: null, loading: Boolean(ownerId), error: "" };

  async function toggle(entry: Pick<WishlistEntry, "placeId" | "city" | "country">) {
    if (!ownerId || mutation.current || visible.loading) return;
    const controller = new AbortController();
    mutation.current = controller;
    setSaving(entry.placeId);
    const active = () => mounted.current && !controller.signal.aborted && currentOwner.current === ownerId && getBrowserAuth()?.currentUser?.uid === ownerId && !hasPendingAccountTransfer();
    try {
      if (!active()) return;
      setState(previous => ({ ...previous, error: "" }));
      if (!visible.list?.exists) await request({ action: "create" }, controller.signal);
      if (!active()) return;
      const saved = visible.list?.entries.some(item => item.placeId === entry.placeId);
      await request(saved ? { action: "remove", placeId: entry.placeId } : { action: "add", ...entry }, controller.signal);
      if (!active()) return;
      const list = wishlistResponseSchema.parse(await request({ action: "read" }, controller.signal));
      if (active()) setState({ ownerId, list, loading: false, error: "" });
    } catch (failure) {
      if (active()) setState(previous => ({ ...previous, error: failure instanceof Error ? failure.message : "Your wishlist couldn't be updated." }));
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (active()) setSaving(null);
    }
  }

  return { ...visible, saving, toggle };
}
