"use client";
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, ChevronDown, LoaderCircle, Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { intakeNextField, intakeQuestion, intakeReplySchema, intakeSummary, type ChatSession, type IntakeField } from "@/lib/planner/intake";
import { zonedNow } from "@/lib/planner/schedule";
import type { PlanRequest } from "@/lib/planner/schema";
import { DatePicker } from "./date-picker";
import { GeneratingScreen } from "./generating-screen";
import { requirementsGuidance } from "@/lib/planner/search-feedback";
import { appendVoiceTranscript, voiceNoteSeconds } from "@/lib/planner/voice-input";
import { useVoiceInput } from "./use-voice-input";
import styles from "./planner-chat.module.css";

const quickReplies: Record<IntakeField, string[]> = {
  location: [], occasion: ["A first date", "Our anniversary", "Just because"], people: ["2 people", "4 people", "6 people"],
  vibe: ["Romantic and relaxed", "Creative and playful", "Something adventurous"], budget: ["₦25,000 total", "₦60,000 total", "Keep the budget open"],
  date: [], time: ["Morning at 10:00", "Afternoon at 14:00", "Evening at 18:00"], duration: ["2 hours", "4 hours", "A full day"],
};

export function PlannerChat({ request, setRequest, session, setSession, onGenerate, onCancelGeneration, loading, loadingStage, serverError, appearance = "red" }: {
  request: PlanRequest; setRequest: Dispatch<SetStateAction<PlanRequest>>; session: ChatSession; setSession: Dispatch<SetStateAction<ChatSession>>;
  onGenerate: () => Promise<void>; onCancelGeneration?: () => void; loading: boolean; loadingStage: string; serverError: string;
  appearance?: "white" | "red" | "dark";
}) {
  const pendingMessage = session.messages.at(-1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const voice = useVoiceInput((text) => setMessage((previous) => appendVoiceTranscript(previous, text)), sending || loading);
  const messageTooLong = message.trim().length > 1200;
  const [editingField, setEditingField] = useState<IntakeField | null>(null);
  const [error, setError] = useState(pendingMessage?.role === "user" ? "Your last message wasn't completed. Let's try that again." : "");
  const [retryMessage, setRetryMessage] = useState(pendingMessage?.role === "user" ? pendingMessage.text : "");
  const controller = useRef<AbortController | null>(null);
  const screen = useRef<HTMLElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const focus = editingField ?? session.nextField ?? intakeNextField(request, session.answered);
  const ready = !focus;
  const summary = intakeSummary(request, session.answered);
  const starting = !session.messages.length && !summary.length;
  const suggestions = starting ? ["Help me plan something romantic", "Something fun and unexpected", "Let’s celebrate an anniversary"] : focus ? quickReplies[focus] : [];
  useEffect(() => () => controller.current?.abort(), []);
  useLayoutEffect(() => {
    const app = screen.current?.closest<HTMLElement>(".is-planning") ?? document.querySelector<HTMLElement>('.is-planning[data-planner-mode="chat"]');
    if (!app) return;
    const viewport = window.visualViewport;
    const previousOverflow = document.body.style.overflow;
    const previousBackground = document.body.style.backgroundColor;
    document.body.style.overflow = "hidden";
    document.body.style.backgroundColor = getComputedStyle(app).backgroundColor;
    const resize = () => {
      if (viewport && viewport.scale !== 1) return;
      app.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      app.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      app.dataset.chatKeyboardOpen = String(window.innerHeight - (viewport?.height ?? window.innerHeight) > 120);
      if (followMessages.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      app.style.removeProperty("--chat-viewport-height");
      app.style.removeProperty("--chat-viewport-top");
      delete app.dataset.chatKeyboardOpen;
      document.body.style.overflow = previousOverflow;
      document.body.style.backgroundColor = previousBackground;
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [appearance]);
  useEffect(() => {
    const viewport = conversation.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => { if (followMessages.current) viewport.scrollTop = viewport.scrollHeight; });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [loading]);
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
    if (!trimmed || trimmed.length > 1200 || controller.current || loading || voice.isActive()) return;
    followMessages.current = true;
    setShowLatest(false);
    const abort = new AbortController(); controller.current = abort;
    voice.clearFeedback();
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
      setEditingField(null);
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
      <div><span className={styles.chatAvatar} aria-hidden="true">o.</span><h1>Oge · Your planning companion</h1></div>
      {summary.length > 0 && <details className={styles.summary}><summary>Date details <ChevronDown size={14} aria-hidden="true" /></summary><dl>{summary.map(({ field, value }) => <div key={field}><dt>{field === "vibe" ? "Vibe" : field === "people" ? "Guests" : field.charAt(0).toUpperCase() + field.slice(1)}</dt><dd>{value}</dd></div>)}</dl></details>}
    </header>
    {summary.length > 0 && <div className={styles.detailChips} aria-label="Edit date details">{summary.map(({ field, value }) => <button key={field} type="button" aria-label={`Change ${field === "location" ? "city" : field}: ${value}`} aria-pressed={editingField === field} disabled={sending || voice.active} onClick={() => { setEditingField(field); scrollToLatest(); if (field !== "time") input.current?.focus(); }}>{value}</button>)}</div>}
    <div ref={conversation} className={styles.transcript} onScroll={(event) => {
      const viewport = event.currentTarget;
      const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
      followMessages.current = nearBottom;
      setShowLatest(!nearBottom);
    }}>
      <div className={styles.thread}>
        {!session.messages.length && <div className={styles.welcome}><span className="eyebrow">A DATE AT LAS</span><h2>{starting ? "Hi, I’m Oge." : "Let’s pick up from here."}</h2><p>{starting ? voice.supported ? "Tell me what you’d enjoy, or tap the mic and talk it through. We’ll fill in any gaps together." : "Tell me what you’d enjoy. We’ll fill in any gaps together." : ready ? "Your details are here. Want to change anything, or shall we find your date?" : `Welcome back. ${intakeQuestion(focus)}`}</p></div>}
        <div className={styles.messages} role="log" aria-label="Conversation with Oge" aria-live="polite" aria-relevant="additions">
          {session.messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.user : styles.assistant}><span className={item.role === "user" ? "sr-only" : styles.speaker}>{item.role === "user" ? "You" : "Oge"}</span><p>{item.text}</p></article>)}
          {sending && <div className={styles.typing} role="status" aria-label="Oge is thinking"><span className={styles.speaker}>Oge</span><div aria-hidden="true"><i /><i /><i /></div></div>}
        </div>
        {!sending && !error && focus === "date" && <div className={styles.inlineCalendar}><DatePicker value={request.date} disabled={voice.active} onChange={(date) => void send(`Let's go on ${date}.`)} /></div>}
        {!sending && !error && focus === "time" && <form className={styles.exactTime} onSubmit={(event) => {
          event.preventDefault();
          const time = new FormData(event.currentTarget).get("startTime");
          if (typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) void send(`Start at ${time}.`);
        }}>
          <label className="field"><span>Choose a specific time</span><input name="startTime" type="time" step={60} required defaultValue={session.answered.includes("time") ? request.startTime : ""} aria-describedby="chat-time-zone" /></label>
          <small id="chat-time-zone">Local time in {request.timeZone}. You can also type a time below.</small>
          <Button type="submit" disabled={voice.active}>Use this time</Button>
        </form>}
        {!sending && !error && suggestions.length > 0 && <div className={`${styles.suggestions} ${starting ? styles.starters : ""}`} aria-label="Suggested replies">{suggestions.map((text) => <button key={text} type="button" disabled={voice.active} onClick={() => void send(text)}>{text}</button>)}</div>}
        {(error || serverError) && <div className={styles.error} role="alert"><p>{error || serverError}</p>{retryMessage && <button type="button" disabled={sending || voice.active} onClick={() => void send(retryMessage, true)}>Try that message again</button>}</div>}
        {ready && !sending && !error && <div className={styles.ready}>{(request.dietary.length > 0 || request.accessibility) && <p className="requirements-guidance">{requirementsGuidance(request)}</p>}<Button disabled={voice.active} onClick={() => void onGenerate()}>Find my date <span aria-hidden="true">↗</span></Button></div>}
      </div>
    </div>
    {showLatest && <button className={styles.latest} type="button" onClick={scrollToLatest}><ArrowDown size={16} aria-hidden="true" /> Latest messages</button>}
    <div className={styles.dock}>
      {editingField && <div className={styles.editing}><p id="chat-edit-prompt">{intakeQuestion(editingField)}</p><button type="button" disabled={sending || voice.active} onClick={() => { setEditingField(null); input.current?.focus(); }}>Cancel edit</button></div>}
      {voice.progress && <div className={styles.voiceCapture}>
        <div className={styles.voiceStatus}><span role="status">{voice.progress.phase === "starting" ? "Waiting for microphone access…" : voice.progress.phase === "stopping" ? "Finishing your voice note…" : "Listening…"}</span><span aria-hidden="true">{voice.progress.seconds}s / {voiceNoteSeconds}s</span><button type="button" onClick={voice.cancel} aria-label="Discard voice note"><X size={18} aria-hidden="true" /></button></div>
        <p className={styles.voiceTranscript}>{voice.progress.transcript || "Tell Oge the date you have in mind."}</p>
      </div>}
      {voice.error && <p className={styles.voiceFeedback} role="alert">{voice.error}{voice.notice ? " Captured words are kept below for you to review." : ""}</p>}
      {voice.notice && !voice.error && <p className={styles.voiceFeedback} role="status">{voice.notice}</p>}
      {messageTooLong && <p className={styles.voiceFeedback} role="alert">Your message is {message.trim().length - 1200} characters too long. Shorten it before sending; your words are kept below.</p>}
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(message); }}>
        <label className="sr-only" htmlFor="planner-chat-message">Message Oge</label>
        <textarea ref={input} id="planner-chat-message" aria-describedby={editingField ? "chat-edit-prompt" : undefined} readOnly={voice.active} aria-invalid={messageTooLong || undefined} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={1} placeholder={sending ? "Add another thought…" : editingField ? `New ${editingField === "location" ? "city" : editingField}…` : voice.supported ? "Type or tap the mic…" : "Tell Oge what you have in mind…"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(hover: hover) and (pointer: fine)").matches) { event.preventDefault(); void send(message); } }} />
        <button className={styles.voiceButton} type="button" aria-label={voice.active ? "Stop voice note" : "Record a voice note"} aria-pressed={voice.active} disabled={sending || !voice.supported || message.length >= 1200 || voice.progress?.phase === "starting" || voice.progress?.phase === "stopping"} onClick={() => { if (voice.isActive()) voice.stop(); else voice.start(Math.max(1, 1200 - message.length)); }}>{voice.progress?.phase === "starting" || voice.progress?.phase === "stopping" ? <LoaderCircle className="spin" size={20} aria-hidden="true" /> : voice.active ? <Square size={18} fill="currentColor" aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}</button>
        <button type="submit" aria-label="Send message" disabled={sending || voice.active || !message.trim() || messageTooLong}><ArrowUp size={20} aria-hidden="true" /></button>
      </form>
    </div>
  </main>;
}
