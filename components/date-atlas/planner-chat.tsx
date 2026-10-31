"use client";
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { intakeNextField, intakeReplySchema, intakeSummary, type ChatSession, type IntakeField } from "@/lib/planner/intake";
import { zonedNow } from "@/lib/planner/schedule";
import type { PlanRequest } from "@/lib/planner/schema";
import { DatePicker } from "./date-picker";
import { GeneratingScreen } from "./generating-screen";
import styles from "./planner-chat.module.css";

const quickReplies: Record<IntakeField, string[]> = {
  location: [], occasion: ["A first date", "Our anniversary", "Just because"], people: ["2 people", "4 people", "6 people"],
  vibe: ["Romantic and relaxed", "Creative and playful", "Something adventurous"], budget: ["₦25,000 total", "₦60,000 total", "Keep the budget open"],
  date: [], time: ["Morning at 10:00", "Afternoon at 14:00", "Evening at 18:00"], duration: ["2 hours", "4 hours", "A full day"],
};

export function PlannerChat({ request, setRequest, session, setSession, onGenerate, onCancelGeneration, loading, loadingStage, serverError }: {
  request: PlanRequest; setRequest: Dispatch<SetStateAction<PlanRequest>>; session: ChatSession; setSession: Dispatch<SetStateAction<ChatSession>>;
  onGenerate: () => Promise<void>; onCancelGeneration?: () => void; loading: boolean; loadingStage: string; serverError: string;
}) {
  const pendingMessage = session.messages.at(-1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(pendingMessage?.role === "user" ? "Your last message wasn't completed. Let's try that again." : "");
  const [retryMessage, setRetryMessage] = useState(pendingMessage?.role === "user" ? pendingMessage.text : "");
  const controller = useRef<AbortController | null>(null);
  const screen = useRef<HTMLElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const focus = session.nextField ?? intakeNextField(request, session.answered);
  const ready = !focus;
  const summary = intakeSummary(request, session.answered);
  const starting = !session.messages.length && !summary.length;
  const suggestions = starting ? ["Help me plan something romantic", "Something fun and unexpected", "Let’s celebrate an anniversary"] : focus ? quickReplies[focus] : [];
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const app = screen.current?.closest<HTMLElement>(".is-planning");
    if (!app) return;
    const viewport = window.visualViewport;
    const resize = () => {
      if (!viewport || viewport.scale === 1) app.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      app.style.removeProperty("--chat-viewport-height");
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useLayoutEffect(() => {
    const textarea = input.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [message, loading]);
  useEffect(() => {
    if (!followMessages.current) return;
    const viewport = conversation.current;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [pendingMessage?.id, sending, error, focus, loading]);

  function scrollToLatest() {
    followMessages.current = true;
    setShowLatest(false);
    const viewport = conversation.current;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  async function send(text: string, retry = false) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1200 || controller.current || loading) return;
    followMessages.current = true;
    setShowLatest(false);
    const abort = new AbortController(); controller.current = abort;
    setSending(true); setError(""); setRetryMessage(""); setMessage("");
    const history = session.messages.filter((_, index) => !retry || index !== session.messages.length - 1).slice(-6).map(({ role, text }) => ({ role, text: text.slice(0, 800) }));
    if (!retry) { const entry: ChatSession["messages"][number] = { id: crypto.randomUUID(), role: "user", text: trimmed }; setSession((previous) => ({ ...previous, messages: [...previous.messages, entry].slice(-24) })); }
    try {
      await planningToken();
      if (abort.signal.aborted) return;
      const response = await plannerFetch("/api/planner-intake", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]), body: JSON.stringify({ request, message: trimmed, answered: session.answered, nextField: focus, today: zonedNow(request.timeZone).date, history }) });
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
  if (loading) return <GeneratingScreen stage={loadingStage} onCancel={onCancelGeneration} />;
  return <main ref={screen} className={styles.chat}>
    <header className={styles.chatHeading}>
      <div><span className={styles.chatAvatar} aria-hidden="true">a.</span><h1>Your date planner</h1></div>
      {summary.length > 0 && <details className={styles.summary}><summary>Date details <ChevronDown size={14} aria-hidden="true" /></summary><dl>{summary.map(({ field, value }) => <div key={field}><dt>{field === "vibe" ? "Vibe" : field === "people" ? "Guests" : field.charAt(0).toUpperCase() + field.slice(1)}</dt><dd>{value}</dd></div>)}</dl></details>}
    </header>
    <div ref={conversation} className={styles.transcript} onScroll={(event) => {
      const viewport = event.currentTarget;
      const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
      followMessages.current = nearBottom;
      setShowLatest(!nearBottom);
    }}>
      <div className={styles.thread}>
        {!session.messages.length && <div className={styles.welcome}><span className="eyebrow">A DATE AT LAS</span><h2>{starting ? "What are you imagining?" : "Let’s pick up from here."}</h2><p>{starting ? <>A city, a feeling, a little something they love.<br />Tell me what you have in mind.</> : ready ? "Your date details are here. Tell me what to change, or let’s find your date." : "Your date details are here. Tell me a little more about what you have in mind."}</p></div>}
        <div className={styles.messages} role="log" aria-label="Conversation with your date planner" aria-live="polite" aria-relevant="additions">
          {session.messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.user : styles.assistant}><span className={item.role === "user" ? "sr-only" : styles.speaker}>{item.role === "user" ? "You" : "adal"}</span><p>{item.text}</p></article>)}
          {sending && <div className={styles.typing} role="status" aria-label="The planner is thinking"><span className={styles.speaker}>adal</span><div aria-hidden="true"><i /><i /><i /></div></div>}
        </div>
        {!sending && !error && focus === "date" && <div className={styles.inlineCalendar}><DatePicker value={request.date} onChange={(date) => void send(`Let's go on ${date}.`)} /></div>}
        {!sending && !error && suggestions.length > 0 && <div className={`${styles.suggestions} ${starting ? styles.starters : ""}`} aria-label="Suggested replies">{suggestions.map((text) => <button key={text} type="button" onClick={() => void send(text)}>{text}</button>)}</div>}
        {(error || serverError) && <div className={styles.error} role="alert"><p>{error || serverError}</p>{retryMessage && <button type="button" disabled={sending} onClick={() => void send(retryMessage, true)}>Try that message again</button>}</div>}
        {ready && !sending && !error && <div className={styles.ready}><Button onClick={() => void onGenerate()}>Find my date <span aria-hidden="true">↗</span></Button></div>}
      </div>
    </div>
    {showLatest && <button className={styles.latest} type="button" onClick={scrollToLatest}><ArrowDown size={16} aria-hidden="true" /> Latest messages</button>}
    <div className={styles.dock}>
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(message); }}>
        <label className="sr-only" htmlFor="planner-chat-message">Message your date planner</label>
        <textarea ref={input} id="planner-chat-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={1} placeholder={sending ? "Add another thought…" : "Message adal…"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(hover: hover) and (pointer: fine)").matches) { event.preventDefault(); void send(message); } }} />
        <button type="submit" aria-label="Send message" disabled={sending || !message.trim()}><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
      <span className={styles.composerNote}>A little input. A lot of thought.</span>
    </div>
  </main>;
}
