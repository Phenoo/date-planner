'use client';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { z } from 'zod';
import { plannerFetch } from '@/lib/firebase/planner-client';
import { validTimeZone } from '@/lib/planner/schedule';
import type { PlanRequest } from '@/lib/planner/schema';

const responseSchema = z.object({ timeZone: z.string().refine(validTimeZone).nullable() });
const timeZones = Intl.supportedValuesOf('timeZone');
const knownZones = new Map<string, string>();
export function DestinationTimeZone({ request, setRequest, disabled = false }: { request: PlanRequest; setRequest: Dispatch<SetStateAction<PlanRequest>>; disabled?: boolean }) {
  const { city, country, timeZone, timeZoneConfirmed } = request;
  const manual = useRef(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (timeZoneConfirmed || !city.trim() || !country.trim()) return;
    const controller = new AbortController(); manual.current = false;
    const key = `${city.toLowerCase()},${country.toLowerCase()}`;
    async function resolve() {
      try {
        let zone = knownZones.get(key);
        if (!zone) {
          setStatus('Checking destination time zone…');
          const response = await plannerFetch('/api/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, country }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
          if (!response.ok) throw new Error();
          zone = responseSchema.parse(await response.json()).timeZone ?? undefined;
        }
        if (controller.signal.aborted || manual.current) return;
        if (!zone) throw new Error();
        knownZones.set(key, zone);
        const selected = zone;
        setRequest(previous => previous.city === city && previous.country === country && !previous.timeZoneConfirmed ? { ...previous, timeZone: selected, timeZoneConfirmed: true } : previous);
        setStatus('');
      } catch { if (!controller.signal.aborted && !manual.current) setStatus('Choose the destination time zone to confirm its local time.'); }
    }
    void resolve();
    return () => controller.abort();
  }, [city, country, timeZoneConfirmed, setRequest]);
  const options = timeZones.includes(timeZone) ? timeZones : [timeZone, ...timeZones];
  return <label className="field"><span>Destination time zone</span><select aria-label="Destination time zone" value={timeZoneConfirmed ? timeZone : ''} disabled={disabled} onChange={event => { const zone = event.target.value; if (!validTimeZone(zone)) return; manual.current = true; setStatus(''); setRequest(previous => ({ ...previous, timeZone: zone, timeZoneConfirmed: true })); }}><option value="" disabled>Choose the local time zone</option>{options.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}</select>{status && <small role="status">{status}</small>}</label>;
}
