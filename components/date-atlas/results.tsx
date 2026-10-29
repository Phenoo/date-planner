"use client";
import { useRef, useState, useEffect, useEffectEvent } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Trash2,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  UnlockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { plannerFetch } from "@/lib/firebase/planner-client";
import { LottieAnimation } from "@/components/animations/lottie-animation";
import { DateMap } from "./date-map";
import { SinglePlaceJourney } from "./single-place-journey";
import { CinematicReveal } from "./cinematic-reveal";
import type { NearbyResult } from "@/lib/maps/schema";
import { Dialog } from "@/components/ui/dialog";
import { formatTime, money } from "@/lib/utils";
import type {
  DatePlan,
  GenerateInput,
  PlanRequest,
  RecommendationResult,
} from "@/lib/planner/schema";

export function Results({
  result,
  planningRequest,
  signedIn,
  accountRevision,
  onSignIn,
  onActivePlan,
  setResult,
  onCustomize,
  onChangeTiming,
  onBack,
  onSave,
  onShare,
  onRegenerate,
  busy,
  requestError,
}: {
  result: RecommendationResult;
  planningRequest: PlanRequest;
  signedIn: boolean;
  accountRevision: string;
  onSignIn: () => void;
  onActivePlan: (plan: DatePlan) => void;
  setResult: (result: RecommendationResult) => void;
  onCustomize: () => void;
  onChangeTiming: () => void;
  onBack: () => void;
  onSave: (plan: DatePlan) => void;
  onShare: (plan: DatePlan, whatsapp?: boolean) => void;
  onRegenerate: (
    request: PlanRequest,
    extra?: Partial<GenerateInput>,
  ) => Promise<void>;
  busy: boolean;
  requestError: string;
}) {
  const [editing, setEditing] = useState(false);
  const [lastRejected, setLastRejected] = useState("");
  const [acceptedCatalog, setAcceptedCatalog] = useState("");
  const [editError, setEditError] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [locked, setLocked] = useState<string[]>([]);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [alternatives, setAlternatives] = useState<DatePlan[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [showScores, setShowScores] = useState(false);
  const assistantRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!assistantOpen) return;
    assistantRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    assistantRef.current
      ?.querySelector("input")
      ?.focus({ preventScroll: true });
  }, [assistantOpen]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const plan = result.plans[0];
  const rememberPlan = useEffectEvent(onActivePlan);
  useEffect(() => {
    if (plan) rememberPlan(plan);
  }, [plan]);
  const activeLocked = locked.filter((id) =>
    plan?.activities.some((activity) => activity.experience.id === id),
  );
  if (plan && acceptedCatalog !== plan.id) {
    const activity = plan.activities[0];
    const place: NearbyResult["places"][number] = { id: activity.experience.id, name: activity.experience.venue, category: activity.experience.category, address: `${activity.experience.area}, ${activity.experience.city}`, distanceKm: activity.distance, reason: activity.reason, mapsUrl: "https://www.google.com/maps/", attributions: [], photo: { url: activity.experience.image, authors: [] } };
    return <CinematicReveal key={plan.id} place={place} request={plan.request} catalogPlan={plan} busy={busy} error={requestError} rejected={lastRejected === plan.id} onAccept={() => setAcceptedCatalog(plan.id)} onEdit={onCustomize} onTiming={onChangeTiming} onReject={() => { setLastRejected(plan.id); void onRegenerate(plan.request, { excludeIds: plan.activities.map((item) => item.experience.id) }); }} />;
  }
  if (!plan && result.nearby?.places[0]) {
    const place = result.nearby.places[0];
    return <SinglePlaceJourney key={`${place.id}:${result.nearby.sessionId ?? ""}`} place={place} sessionId={result.nearby.sessionId} request={planningRequest} signedIn={signedIn} accountRevision={accountRevision} busy={busy} error={requestError} rejected={lastRejected === place.id} onSignIn={onSignIn} onEdit={onCustomize} onTiming={onChangeTiming} onReject={() => {
      setLastRejected(place.id);
      void onRegenerate(planningRequest, { excludePlaceIds: [place.id] });
    }} />;
  }
  if (!plan)
    return (
      <main className="empty-state page-container">
        <LottieAnimation animation="empty" label="Atlas is finding your next date" width={240} height={170} />
        <span className="eyebrow">LET&apos;S FIND ANOTHER WAY</span>
        <h1>
          A little adjustment
          <br />
          could make all the difference.
        </h1>
        <p>
          No plans fit all your preferences yet. Your spending limit has been kept exactly as you set it.
        </p>
        <div className="empty-reasons">
          {result.warnings.map((warning) => (
            <p key={warning}>
              <Info size={16} />
              {warning}
            </p>
          ))}
        </div>
        <Button onClick={onCustomize}>
          Adjust my preferences
          <ArrowRight size={16} />
        </Button>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to inspiration
        </Button>
      </main>
    );
  async function editActivities(ids: string[]) {
    if (busy || chatBusy || editing) return;
    setEditing(true);
    setEditError("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await plannerFetch("/api/plans/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: plan.request, experienceIds: ids }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "We couldn't update the itinerary.");
      if (!controller.signal.aborted)
        setResult({
          ...result,
          plans: result.plans.map((item) =>
            item.id === plan.id
              ? {
                  ...data.plan,
                  type: plan.type,
                  introduction: plan.introduction,
                }
              : item,
          ),
        });
    } catch (failure) {
      if (!controller.signal.aborted)
        setEditError(
          failure instanceof Error ? failure.message : "Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setEditing(false);
    }
  }
  async function loadSwaps(index: number) {
    setSwapIndex(index);
    setAlternatives([]);
    setSwapError("");
    setSwapLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await plannerFetch("/api/plans/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(plan.demo ? {} : { planId: plan.id }),
          request: plan.request,
          experienceIds: plan.activities.map(
            (activity) => activity.experience.id,
          ),
          index,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "We couldn't find alternatives.");
      setAlternatives(data.alternatives);
    } catch (error) {
      if (!controller.signal.aborted)
        setSwapError(
          error instanceof Error ? error.message : "Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setSwapLoading(false);
    }
  }
  async function chat(message: string) {
    if (chatBusy || busy || !message.trim()) return;
    setChatBusy(true);
    setChatInput("");
    setChatMessages((previous) => [
      ...previous,
      { role: "user", text: message },
    ]);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await plannerFetch("/api/planner-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(plan.demo ? {} : { planId: plan.id }),
          request: plan.request,
          message,
          lockedIds: activeLocked,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "We couldn't update your plan.");
      if (data.plans.length) {
        setResult(data);
      }
      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: data.message },
      ]);
    } catch (error) {
      if (!controller.signal.aborted)
        setChatMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            text: error instanceof Error ? error.message : "Please try again.",
          },
        ]);
    } finally {
      if (!controller.signal.aborted) setChatBusy(false);
    }
  }
  function chooseSwap(alternative: DatePlan) {
    const updated = {
      ...alternative,
      type: plan.type,
      title: alternative.title,
      introduction: plan.introduction,
    };
    setResult({
      ...result,
      plans: result.plans.map((item) => (item.id === plan.id ? updated : item)),
    });
    setSwapIndex(null);
  }
  const changing = busy || chatBusy || editing;
  const dateLabel = new Date(
    `${plan.request.date}T12:00:00Z`,
  ).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lagos",
  });
  return (
    <main className="results-page page-container">
      <button className="text-link back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        Back to inspiration
      </button>
      <LottieAnimation key={result.plans.map((item) => item.id).join("|")} animation="celebration" label="Your recommendations are ready" width={120} height={85} />
      <div className="results-heading">
        <div>
          <span className="eyebrow">
            THOUGHTFULLY PUT TOGETHER, JUST FOR YOU
          </span>
          <h1>We&apos;ve found something special for you.</h1>
          <p>
            {result.plans.length} date{" "}
            {result.plans.length === 1 ? "idea" : "ideas"}, thoughtfully planned
            around your vibe, location, and budget.
          </p>
        </div>
        <Button variant="outline" onClick={onCustomize} disabled={changing}>
          Customize preferences
          <ChevronDown size={15} />
        </Button>
      </div>
      <div className={`data-notice ${plan.demo ? "demo-notice" : ""}`}>
        <Info size={17} />
        <span>{result.warnings[0]}</span>
      </div>
      {result.warnings.slice(1).map((warning) => (
        <p className="secondary-notice" key={warning}>
          {warning}
        </p>
      ))}
      {requestError && (
        <p className="error-message" role="alert">
          {requestError}
        </p>
      )}
      <div className="preference-bar" aria-label="Edit planning preferences">
        {[
          {
            label: "Location",
            value: `${plan.request.area}, ${plan.request.city}`,
          },
          { label: "Budget", value: plan.budget === null ? "Not set" : money(plan.budget) },
          { label: "Occasion", value: plan.request.occasion },
          { label: "Vibe", value: plan.request.vibes.join(" + ") },
          { label: "Date", value: dateLabel },
        ].map((item) => (
          <button key={item.label} onClick={onCustomize} disabled={changing}>
            <small>{item.label}</small>
            <span>
              {item.value}
              <ChevronDown size={12} />
            </span>
          </button>
        ))}
      </div>
      {editError && <div className="itinerary-edit-error" role="alert"><span>{editError}</span><button aria-label="Dismiss itinerary error" onClick={() => setEditError("")}>×</button></div>}
      <div className="itinerary-layout" id="full-itinerary" aria-busy={changing}>
        <aside
          ref={assistantRef}
          className={`assistant-sidebar ${assistantOpen ? "mobile-open" : ""}`}
          id="date-assistant"
        >
          <button
            className="assistant-close text-link"
            onClick={() => setAssistantOpen(false)}
          >
            Close assistant ×
          </button>{" "}
          <div className="assistant-card">
            <LottieAnimation key={chatBusy ? "thinking" : "idle"} animation="concierge" label={chatBusy ? "Your assistant is thinking" : "Your date assistant"} width={150} height={100} loop={chatBusy} autoplay={chatBusy} />
            <div className="assistant-heading">
              <span></span>
              <div>
                <h3>Your date assistant</h3>
                <p>Let&apos;s make it even more you.</p>
              </div>
            </div>
            <div className="chat-messages" aria-live="polite">
              {chatMessages.map((message, index) => (
                <p key={index} className={`chat-bubble ${message.role}`}>
                  {message.text}
                </p>
              ))}
            </div>
            <div className="assistant-suggestions">
              {[
                "Make this date cheaper",
                "Somewhere closer",
                "Make it more romantic",
                "She's vegetarian",
                "Add more adventure",
                "Surprise me",
              ].map((suggestion) => (
                <button
                  disabled={changing}
                  key={suggestion}
                  onClick={() => void chat(suggestion)}
                >
                  {suggestion}
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void chat(chatInput);
              }}
              className="chat-form"
            >
              <input
                aria-label="Ask the date planner"
                placeholder="Tell us what you'd change…"
                maxLength={1000}
                value={chatInput}
                disabled={changing}
                onChange={(event) => setChatInput(event.target.value)}
              />
              <button
                aria-label="Send request"
                disabled={changing || !chatInput.trim()}
              >
                {chatBusy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </form>
            <span className="assistant-note">
              Every update is checked against your constraints.
            </span>
          </div>
        </aside>
        <section className="itinerary-main">
          <div className="itinerary-cover">
            <Image
              src={
                plan.activities.find(
                  (activity) =>
                    activity.experience.category !== "Food & dining",
                )?.experience.image ?? plan.activities[0].experience.image
              }
              alt="An idea of the atmosphere for your date; illustrative photography"
              fill
              sizes="(max-width: 800px) 100vw, 65vw"
            />
            <div className="cover-shade" />
            <div className="cover-copy">
              <span className="eyebrow">
                YOUR {plan.request.occasion.toUpperCase()}
              </span>
              <h2>{plan.title}</h2>
              <div>
                <span>
                  <MapPin size={14} />
                  {plan.request.area}, {plan.request.city}
                </span>
                <span>{dateLabel}</span>
              </div>
            </div>
            <span className="photo-caption">
              Illustrative photography{plan.demo ? " · Demo itinerary" : ""}
            </span>
          </div>
          <div className="itinerary-intro">
            <p>{plan.introduction}</p>
            <div className="itinerary-meta">
              <span>{plan.request.guests} people</span>
              <span>
                <Clock3 size={15} />
                {Math.floor(plan.duration / 60)}h {plan.duration % 60}m incl.
                travel
              </span>
              <span>
                <MapPin size={15} />
                {plan.totalDistance} km estimated route
              </span>
            </div>
          </div>
          <div className="timeline-heading">
            <h3>A little look at your day</h3>
            <Button
              variant="ghost"
              size="small"
              onClick={() => setMapOpen(true)}
            >
              <MapPin size={15} />
              View route
            </Button>
          </div>
          <div className="timeline">
            {plan.activities.map((activity, index) => (
              <article className="timeline-stop" key={activity.experience.id}>
                <div className="timeline-marker">{index + 1}</div>
                <div className="timeline-time">
                  <span>{formatTime(activity.start)}</span>
                  <small>{activity.experience.duration} minutes</small>
                </div>
                <div className="timeline-card">
                  <div className="timeline-photo">
                    <Image
                      src={activity.experience.image}
                      alt="Illustrative experience atmosphere"
                      fill
                      sizes="(max-width:700px) 85vw, 40vw"
                    />
                    <span>
                      {activity.experience.demo
                        ? "DEMO EXPERIENCE"
                        : "ILLUSTRATIVE PHOTO"}
                    </span>
                  </div>
                  <div className="timeline-card-top">
                    <span className="mini-label">
                      {activity.experience.category}
                    </span>
                    <div>
                      <button
                        disabled={changing}
                        className={`icon-action ${activeLocked.includes(activity.experience.id) ? "locked" : ""}`}
                        title={
                          activeLocked.includes(activity.experience.id)
                            ? "Unlock activity"
                            : "Keep this activity when regenerating"
                        }
                        aria-label={`${activeLocked.includes(activity.experience.id) ? "Unlock" : "Lock"} ${activity.experience.name}`}
                        aria-pressed={activeLocked.includes(
                          activity.experience.id,
                        )}
                        onClick={() =>
                          setLocked((previous) =>
                            previous.includes(activity.experience.id)
                              ? previous.filter(
                                  (id) => id !== activity.experience.id,
                                )
                              : [...previous, activity.experience.id],
                          )
                        }
                      >
                        {activeLocked.includes(activity.experience.id) ? (
                          <LockKeyhole size={15} />
                        ) : (
                          <UnlockKeyhole size={15} />
                        )}
                      </button>
                      <button
                        disabled={
                          changing ||
                          activeLocked.includes(activity.experience.id)
                        }
                        className="swap-button"
                        onClick={() => void loadSwaps(index)}
                      >
                        <RefreshCw size={13} />
                        Swap
                      </button>
                    </div>
                  </div>
                  <h4>{activity.experience.name}</h4>
                  <p className="venue-name">
                    <MapPin size={12} />
                    {activity.experience.venue} · {activity.experience.area}
                  </p>
                  <p>{activity.experience.description}</p>
                  <div className="why-match">
                    <span>{activity.reason}</span>
                  </div>
                  <div className="activity-footer">
                    <span>
                      {formatTime(activity.start)} – {formatTime(activity.end)}
                    </span>
                    <strong>
                      {money(activity.cost)}{" "}
                      <small>estimated · {plan.request.guests} people</small>
                    </strong>
                  </div>
                  <div className="activity-edit-actions">
                    <button
                      disabled={changing || index === 0}
                      aria-label={`Move ${activity.experience.name} earlier`}
                      onClick={() => {
                        const ids = plan.activities.map(
                          (item) => item.experience.id,
                        );
                        [ids[index - 1], ids[index]] = [
                          ids[index],
                          ids[index - 1],
                        ];
                        void editActivities(ids);
                      }}
                    >
                      <ArrowUp size={13} />
                      Earlier
                    </button>
                    <button
                      disabled={
                        changing || index === plan.activities.length - 1
                      }
                      aria-label={`Move ${activity.experience.name} later`}
                      onClick={() => {
                        const ids = plan.activities.map(
                          (item) => item.experience.id,
                        );
                        [ids[index + 1], ids[index]] = [
                          ids[index],
                          ids[index + 1],
                        ];
                        void editActivities(ids);
                      }}
                    >
                      <ArrowDown size={13} />
                      Later
                    </button>
                    <button
                      disabled={
                        changing ||
                        plan.activities.length <= 1 ||
                        activeLocked.includes(activity.experience.id)
                      }
                      aria-label={`Remove ${activity.experience.name}`}
                      onClick={() =>
                        void editActivities(
                          plan.activities
                            .filter((_, position) => position !== index)
                            .map((item) => item.experience.id),
                        )
                      }
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                  <details className="reservation-detail">
                    <summary>
                      Before you go
                      <ChevronDown size={12} />
                    </summary>
                    <p>{activity.experience.reservation}</p>
                    <p>
                      {activity.experience.verifiedAt
                        ? `Information last verified: ${activity.experience.verifiedAt}`
                        : "Sample price; no real-world price verification."}
                    </p>
                    {activity.experience.bookingUrl &&
                      !activity.experience.demo && (
                        <a
                          href={activity.experience.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Visit booking provider
                          <ExternalLink size={12} />
                        </a>
                      )}
                  </details>
                </div>
                <div className="travel-note">
                  <FootstepIcon />
                  <span>
                    {activity.travelMinutes} min estimated{" "}
                    {plan.request.transport === "Walking" ? "walk" : "travel"}
                    {index === 0
                      ? " from starting area"
                      : " from previous stop"}{" "}
                    · {activity.distance.toFixed(1)} km
                  </span>
                </div>
              </article>
            ))}
          </div>
          <div className="return-note">
            <MapPin size={15} />
            <span>
              Allow another {plan.returnTravel} minutes to return to your
              starting area. Included in your date&apos;s duration.
            </span>
          </div>
          <div className="preparation">
            <span className="eyebrow">THE LITTLE THINGS</span>
            <h3>A little preparation goes a long way.</h3>
            {plan.tips.map((tip) => (
              <p key={tip}>
                <Check size={15} />
                {tip}
              </p>
            ))}
          </div>
        </section>
        <aside className="itinerary-sidebar">
          <div className="date-summary-card">
            <span className="mini-label">YOUR DAY AT A GLANCE</span>
            <h3>{dateLabel}</h3>
            <dl>
              <div>
                <dt>From</dt>
                <dd>{plan.request.startTime}</dd>
              </div>
              <div>
                <dt>Back around</dt>
                <dd>
                  {formatTime(
                    plan.activities[plan.activities.length - 1].end +
                      plan.returnTravel,
                  )}
                </dd>
              </div>
              <div>
                <dt>Time together</dt>
                <dd>
                  {Math.floor(plan.duration / 60)}h {plan.duration % 60}m
                </dd>
              </div>
              <div>
                <dt>Experiences</dt>
                <dd>{plan.activities.length}</dd>
              </div>
            </dl>
          </div>
          <details className="map-panel" open>
            <summary>
              Your route
              <ChevronDown size={14} />
            </summary>
            <DateMap
              walking={plan.request.transport === "Walking"}
              experiences={plan.activities.map(
                (activity) => activity.experience,
              )}
            />
          </details>
          <div className="budget-card">
            <div className="budget-card-heading">
              <h3>Good times. Smart spending.</h3>
            </div>
            <span className="mini-label">YOUR ESTIMATED TOTAL</span>
            <div className="total-price">
              {money(plan.total)}
              <span>{plan.budget === null ? "No spending limit set" : `of ${money(plan.budget)} budget`}</span>
            </div>
            {plan.budget !== null && <div className="budget-track">
              <div
                style={{
                  width: `${Math.min(100, (plan.total / plan.budget) * 100)}%`,
                }}
              />
            </div>}
            {plan.remaining !== null && <span className="remaining">
              <Check size={13} />
              {money(plan.remaining)} comfortably left over
            </span>}
            <div className="budget-lines">
              {plan.activities.map((activity) => (
                <div key={activity.experience.id}>
                  <span>{activity.experience.category}</span>
                  <span>{money(activity.cost)}</span>
                </div>
              ))}
              <div>
                <span>
                  Transport{" "}
                  {plan.request.includeTransport ? "(estimated)" : "(excluded)"}
                </span>
                <span>{money(plan.transportCost)}</span>
              </div>
              <div>
                <span>Contingency cushion</span>
                <span>{money(plan.contingencyCost)}</span>
              </div>
              <div className="budget-total">
                <strong>Estimated total</strong>
                <strong>{money(plan.total)}</strong>
              </div>
            </div>
            <Button disabled={changing} onClick={() => onSave(plan)}>
              <Bookmark size={16} />
              Save this plan
            </Button>
            <div className="share-actions">
              <Button
                variant="outline"
                size="small"
                onClick={() => onShare(plan)}
              >
                <Copy size={14} />
                Copy share link
              </Button>
              <Button
                variant="outline"
                size="small"
                onClick={() => onShare(plan, true)}
              >
                <Share2 size={14} />
                WhatsApp
              </Button>
            </div>
            <p className="private-note">
              <ShieldCheck size={12} />
              No reservation or payment has been made.
            </p>
          </div>
          <div className="match-card">
            <div>
              <div className="match-ring">
                {plan.score}
                <small>%</small>
              </div>
              <div>
                <strong>Your kind of date.</strong>
                <p>Based on your preferences</p>
              </div>
            </div>
            <button
              className="text-link"
              onClick={() => setShowScores(!showScores)}
            >
              How we matched you
              <ChevronDown size={13} />
            </button>
            {showScores && (
              <div className="score-details">
                {Object.entries(plan.scores).filter(([name]) => plan.budget !== null || name !== "budget").map(([name, score]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <span>{Math.round(score * 100)}%</span>
                  </div>
                ))}
                <p>
                  {plan.budget === null
                    ? "Your match uses interests, location, occasion, and information reliability. No spending limit is applied."
                    : "Weights: interests 30%, budget 25%, location 20%, occasion 15%, reliability 10%."} A matching score is not a venue rating.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
      <div className="optimization-bar">
        <div>
          <span>A different take on a lovely day?</span>
        </div>
        <div>
          {[
            "Spend less",
            "Reduce travel time",
            "Add more adventure",
            "Avoid restaurants",
          ].map((action) => (
            <Button
              key={action}
              variant="outline"
              size="small"
              disabled={changing}
              onClick={() => void chat(action)}
            >
              {action}
            </Button>
          ))}
          <Button
            variant="dark"
            size="small"
            disabled={changing}
            onClick={() =>
              void onRegenerate(plan.request, {
                lockedIds: activeLocked,
                variation: 1 + Math.floor(Math.random() * 100),
              })
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            Try another plan
          </Button>
        </div>
      </div>
      <Dialog
        open={swapIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            abortRef.current?.abort();
            setSwapIndex(null);
          }
        }}
        title="A lovely alternative"
        className="swap-dialog"
      >
        <span className="eyebrow">A CHANGE OF SCENE</span>
        <h2>Let&apos;s find a better fit.</h2>
        <p>
          These alternatives keep your other activities and fit your budget,
          opening hours, and schedule.
        </p>
        {swapLoading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" size={25} />
            <span>Checking the little details…</span>
          </div>
        ) : swapError ? (
          <p className="error-message">{swapError}</p>
        ) : !alternatives.length ? (
          <div className="empty-small">
            <Info size={24} />
            <p>
              No replacement fits this schedule and budget. Try customizing your
              preferences or unlocking more activities.
            </p>
          </div>
        ) : (
          <div className="swap-options">
            {alternatives.map((alternative) => {
              const activity = alternative.activities[swapIndex ?? 0];
              return (
                <button
                  key={alternative.id}
                  onClick={() => chooseSwap(alternative)}
                >
                  <div className="swap-image">
                    <Image
                      src={activity.experience.image}
                      alt="Illustrative experience photography"
                      fill
                      sizes="100px"
                    />
                  </div>
                  <div>
                    <span className="mini-label">
                      {activity.experience.category}
                    </span>
                    <h3>{activity.experience.name}</h3>
                    <p>
                      {activity.experience.area} ·{" "}
                      {activity.experience.duration} min
                    </p>
                    <p className="swap-reason">{activity.reason}</p>
                    <strong>
                      {money(activity.cost)}{" "}
                      <small>· New plan total {money(alternative.total)}</small>
                    </strong>
                  </div>
                  <ArrowRight size={18} />
                </button>
              );
            })}
          </div>
        )}
      </Dialog>
      <div className="mobile-itinerary-actions">
        <button
          className="ask-ai-button"
          onClick={() => setAssistantOpen(true)}
        >
          <Sparkles size={16} />
          Ask your planner
        </button>
        <Button disabled={changing} onClick={() => onSave(plan)}>
          <Bookmark size={16} />
          Save Plan
        </Button>
      </div>
      <Dialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        title="Your date route"
        className="route-dialog"
      >
        <span className="eyebrow">A LITTLE LESS GETTING THERE</span>
        <h2>Your day, connected.</h2>
        <p>
          {plan.demo
            ? "These are illustrative demo locations, not real venues. The area link below is for orientation only."
            : "Routes and travel times are distance-based estimates. Use directions for current conditions."}
        </p>
        <DateMap
          walking={plan.request.transport === "Walking"}
          experiences={plan.activities.map((activity) => activity.experience)}
        />
        <div className="route-visual">
          {plan.activities.map((activity, index) => (
            <div key={activity.experience.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{activity.experience.venue}</strong>
                <p>
                  {activity.experience.area} · {formatTime(activity.start)}
                </p>
                <small>
                  {activity.travelMinutes} min estimated travel from{" "}
                  {index === 0 ? "starting area" : "previous stop"}
                </small>
              </div>
              {!activity.experience.demo && (
                <a
                  aria-label={`Directions to ${activity.experience.venue}`}
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activity.experience.lat},${activity.experience.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          ))}
        </div>
        <Button asChild variant="outline">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${plan.request.area}, ${plan.request.city}, ${plan.request.country}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={16} />
            View {plan.request.area} on Google Maps
            <ExternalLink size={14} />
          </a>
        </Button>
        <p className="secondary-notice">
          {plan.totalDistance} km estimated round trip · No live traffic or
          availability data.
        </p>
      </Dialog>
    </main>
  );
}
function FootstepIcon() {
  return <ArrowDown size={12} />;
}
