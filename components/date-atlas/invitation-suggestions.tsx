import { useState } from "react";
import { Button } from "@/components/ui/button";
import { suggestedVibeSchema, type InvitationReplyResult } from "@/lib/planner/invitations";
import { zonedNow } from "@/lib/planner/schedule";
import styles from "./date-journey.module.css";

export function InvitationSuggestions({ timeZone, busy, onSuggest }: {
  timeZone: string;
  busy: boolean;
  onSuggest: (reply: Exclude<InvitationReplyResult, { response: string }>) => void;
}) {
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [vibe, setVibe] = useState("");
  return <>
    <details className={styles.suggestion}>
      <summary>Suggest a different vibe</summary>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        const suggested = suggestedVibeSchema.safeParse(vibe);
        if (suggested.success) onSuggest({ suggestedVibe: suggested.data });
      }}>
        <label className="field"><span>What kind of date would you prefer?</span>
          <select required disabled={busy} value={vibe} onChange={(event) => setVibe(event.target.value)}>
            <option value="" disabled>Choose a vibe</option>
            {suggestedVibeSchema.options.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <Button disabled={busy}>Suggest this vibe</Button>
      </form>
    </details>
    <details className={styles.suggestion}>
      <summary>Suggest another time</summary>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault();
        onSuggest({ suggestedTime: { date: day, startTime: time, timeZone } });
      }}>
        <label className="field"><span>Day</span><input required type="date" disabled={busy} min={zonedNow(timeZone).date} value={day} onChange={(event) => setDay(event.target.value)} /></label>
        <label className="field"><span>Time ({timeZone})</span><input required type="time" disabled={busy} value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <Button disabled={busy}>Suggest this time</Button>
      </form>
    </details>
  </>;
}
