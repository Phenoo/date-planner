"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { intakeNextField, intakeReplySchema, intakeSummary, type ChatSession, type IntakeField } from "@/lib/planner/intake";
import { dateValue } from "@/lib/planner/schedule";
import type { PlanRequest } from "@/lib/planner/schema";
import { DatePicker } from "./date-picker";
import { GeneratingScreen } from "./generating-screen";
import styles from "./planner-chat.module.css";

const quickReplies: Record<IntakeField, string[]> = {
  location: [], occasion: ["A first date", "Our anniversary", "Just because"], people: ["2 people", "4 people", "6 people"],
  vibe: ["Romantic and relaxed", "Creative and playful", "Something adventurous"], budget: ["₦25,000 total", "₦60,000 total", "Keep the budget open"],
  date: [], time: ["Morning at 10:00", "Afternoon at 14:00", "Evening at 18:00"], duration: ["2 hours", "4 hours", "A full day"],
};

export function PlannerChat({ request, setRequest, session, setSession, onGenerate, loading, loadingStage, serverError }: {
  request: PlanRequest; setRequest: Dispatch<SetStateAction<PlanRequest>>; session: ChatSession; setSession: Dispatch<SetStateAction<ChatSession>>;
  onGenerate: () => Promise<void>; loading: boolean; loadingStage: string; serverError: string;
}) {
  const pendingMessage = session.messages.at(-1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(pendingMessage?.role === "user" ? "Your last message wasn't completed. Try it again, or keep planning with the steps." : "");
  const [retryMessage, setRetryMessage] = useState(pendingMessage?.role === "user" ? pendingMessage.text : "");
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const focus = session.nextField ?? intakeNextField(request, session.answered);
  const ready = !focus;
  const summary = intakeSummary(request, session.answered);
  const suggestions = session.messages.length ? focus ? quickReplies[focus] : [] : ["Help me plan something romantic", "Something fun and unexpected", "Let’s celebrate an anniversary"];
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" });
  }, [session.messages.length, sending]);

  async function send(text: string, retry = false) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1200 || controller.current || loading) return;
    const abort = new AbortController(); controller.current = abort;
    setSending(true); setError(""); setRetryMessage(""); setMessage("");
    const history = session.messages.filter((_, index) => !retry || index !== session.messages.length - 1).slice(-6).map(({ role, text }) => ({ role, text: text.slice(0, 800) }));
    if (!retry) { const entry: ChatSession["messages"][number] = { id: crypto.randomUUID(), role: "user", text: trimmed }; setSession((previous) => ({ ...previous, messages: [...previous.messages, entry].slice(-24) })); }
    try {
      await planningToken();
      if (abort.signal.aborted) return;
      const response = await plannerFetch("/api/planner-intake", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]), body: JSON.stringify({ request, message: trimmed, answered: session.answered, nextField: focus, today: dateValue(new Date()), history }) });
      const reply = intakeReplySchema.parse(await readPlanningResponse(response, () => {}));
      if (abort.signal.aborted) return;
      setRequest(reply.request);
      const entry: ChatSession["messages"][number] = { id: crypto.randomUUID(), role: "assistant", text: reply.message };
      setSession((previous) => ({ answered: reply.answered, nextField: reply.nextField, messages: [...previous.messages, entry].slice(-24) }));
    } catch (failure) {
      if (!abort.signal.aborted) { setError(failure instanceof Error ? failure.message : "Your message couldn't be sent. Please try again."); setRetryMessage(trimmed); }
    } finally {
      if (!abort.signal.aborted) { setSending(false); controller.current = null; }
    }
  }
  if (loading) return <GeneratingScreen stage={loadingStage} />;
  return <main className={styles.chat}>
    <header className={styles.chatHeading}><span className="eyebrow">A DATE AT LAS · YOUR PLANNER</span><h1>Let’s make it<br />your kind of date.</h1><p>Tell me what you have in mind. A little or a lot — we’ll take it from there.</p></header>
    <div className={styles.messages} role="log" aria-label="Conversation with your date planner" aria-live="polite" aria-relevant="additions">
      <article className={styles.assistant}><span className={styles.speaker}>adal</span><p>Hi, I’m your date planner. Tell me about the date you’re imagining: the city, the occasion, and anything they’d love. You can give me several details at once.</p></article>
      {session.messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.user : styles.assistant}><span className={styles.speaker}>{item.role === "user" ? "You" : "adal"}</span><p>{item.text}</p></article>)}
      {sending && <div className={styles.typing} role="status" aria-label="The planner is thinking"><i /><i /><i /></div>}
    </div>
    {!sending && !error && focus === "date" && <div className={styles.inlineCalendar}><DatePicker value={request.date} onChange={(date) => void send(`Let's go on ${date}.`)} /></div>}
    {!sending && !error && suggestions.length > 0 && <div className={styles.suggestions} aria-label="Suggested replies">{suggestions.map((text) => <button key={text} type="button" onClick={() => void send(text)}>{text}</button>)}</div>}
    {summary.length > 0 && <details className={styles.summary} open={ready}><summary>Your date preferences <span>{summary.length} of 8 details</span></summary><dl>{summary.map(({ field, value }) => <div key={field}><dt>{field === "vibe" ? "Vibe" : field === "people" ? "Guests" : field.charAt(0).toUpperCase() + field.slice(1)}</dt><dd>{value}</dd></div>)}</dl></details>}
    {(error || serverError) && <div className={styles.error} role="alert"><p>{error || serverError}</p>{retryMessage && <button type="button" disabled={sending} onClick={() => void send(retryMessage, true)}>Try that message again</button>}</div>}
    {ready && !sending && !error && <div className={styles.ready}><Button onClick={() => void onGenerate()}>Find my date <span aria-hidden="true">↗</span></Button></div>}
    <div ref={bottom} />
    <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(message); }}>
      <label className="sr-only" htmlFor="planner-chat-message">Message your date planner</label>
      <textarea ref={input} id="planner-chat-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={2} disabled={sending} placeholder="Tell me about your date…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(hover: hover) and (pointer: fine)").matches) { event.preventDefault(); void send(message); } }} />
      <button type="submit" aria-label="Send message" disabled={sending || !message.trim()}><ArrowUp size={20} aria-hidden="true" /></button>
      <span>{sending ? "Thinking about the details…" : "Your preferences stay with you when you switch interfaces."}</span>
    </form>
  </main>;
}
