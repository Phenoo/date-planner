"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { suggestedTimeSchema } from "@/lib/planner/invitations";
import { readPlanningResponse } from "@/lib/firebase/planner-client";
import { zonedNow } from "@/lib/planner/schedule";
export function SuggestTime({ token, timeZone, onSuggested }: { token: string; timeZone: string; onSuggested: (value: z.infer<typeof suggestedTimeSchema>) => void }) {
  const [day, setDay] = useState(""); const [time, setTime] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit() {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setError("");
    try {
      const result = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", date: day, startTime: time, timeZone }), signal: AbortSignal.any([current.signal, AbortSignal.timeout(20000)]) });
      const data = z.object({ suggestedTime: suggestedTimeSchema }).parse(await readPlanningResponse(result, () => {}));
      if (!current.signal.aborted) onSuggested(data.suggestedTime);
    } catch (failure) { if (!current.signal.aborted) setError(failure instanceof Error ? failure.message : "That suggestion couldn't be saved."); }
    finally { if (!current.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return <details><summary>Suggest another time</summary><form className="form-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }}><p>This is a suggestion, not acceptance or a booking. The creator will need to review the venue and send an updated invitation.</p><label className="field"><span>Day</span><input required type="date" min={zonedNow(timeZone).date} value={day} onChange={(event) => setDay(event.target.value)} /></label><label className="field"><span>Time · {timeZone}</span><input required type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><Button disabled={busy}>{busy ? "Sending suggestion…" : "Suggest this time"}</Button>{error && <p role="alert">{error}</p>}</form></details>;
}
