"use client";
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";
import { plannerFetch } from "@/lib/firebase/planner-client";
import { validTimeZone } from "@/lib/planner/schedule";
import type { PlanRequest } from "@/lib/planner/schema";

const responseSchema = z.object({ timeZone: z.string().refine(validTimeZone).nullable() });
const knownZones = new Map<string, string>();
export function useDestinationTimeZone(request: PlanRequest, setRequest: Dispatch<SetStateAction<PlanRequest>>, enabled: boolean) {
  const { city, country, timeZoneConfirmed } = request;
  useEffect(() => {
    if (!enabled || timeZoneConfirmed || !city.trim() || !country.trim()) return;
    const controller = new AbortController();
    const key = `${city.toLowerCase()},${country.toLowerCase()}`;
    async function resolve() {
      try {
        let zone = knownZones.get(key);
        if (!zone) {
          const response = await plannerFetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, country }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
          if (!response.ok) return;
          zone = responseSchema.parse(await response.json()).timeZone ?? undefined;
        }
        if (!zone || controller.signal.aborted) return;
        knownZones.set(key, zone);
        const selected = zone;
        setRequest(previous => previous.city === city && previous.country === country && !previous.timeZoneConfirmed ? { ...previous, timeZone: selected, timeZoneConfirmed: true } : previous);
      } catch { /* Generation rechecks the destination before validating its local time. */ }
    }
    void resolve();
    return () => controller.abort();
  }, [city, country, timeZoneConfirmed, enabled, setRequest]);
}
