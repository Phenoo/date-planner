"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { GeneratingScreen } from "./generating-screen";
import { NearbyCities } from "./nearby-cities";
import { VibeChoices } from "./vibe-choices";
import { GenderChoices } from "./gender-choices";
import { DatePicker } from "./date-picker";
import { calendarDay, calendarLabel, zonedNow, scheduleError } from "@/lib/planner/schedule";
import { usePlannerConversation } from "./use-planner-conversation";
import { PlannerReaction } from "./planner-reaction";
import { conversationAnswerKey, localReaction } from "@/lib/planner/conversation";
import styles from "./planner-conversation.module.css";
import {
  areas,
  cities,
  genderLabel,
  genderOptions,
  occasions,
  requestSchema,
  vibes,
  type PlanRequest,
} from "@/lib/planner/schema";
import {
  plannerQuestions,
  plannerQuestionCount,
} from "@/lib/planner/questions";
import { money } from "@/lib/utils";
import type { CompanionTheme } from "@/lib/animations/registry";
import type { DetectedLocation } from "@/lib/maps/schema";
import { browserLocationError, resolveLocation } from "@/lib/maps/client-location";

export { Field } from "@/components/ui/field";
export { plannerQuestionCount } from "@/lib/planner/questions";

function AnswerChoices<T extends string | number>({
  options,
  selected,
  onChoose,
  disabled = false,
}: {
  options: readonly { label: string; value: T }[];
  selected: readonly T[];
  onChoose: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="typeform-choices">
      {options.map((option, index) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={selected.includes(option.value)}
          className={`typeform-choice ${selected.includes(option.value) ? "is-selected" : ""}`}
          disabled={disabled}
          onClick={() => onChoose(option.value)}
        >
          <span className="answer-letter" aria-hidden="true">
            {String.fromCharCode(65 + index)}
          </span>
          <span>{option.label}</span>
          {selected.includes(option.value) && (
            <span className="answer-check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
const budgetOptions = [10000, 25000, 50000, 60000, 100000, 200000].map(
  (value) => ({
    value,
    label: value === 10000 ? `Up to ${money(value)}` : money(value),
  }),
);
const timeOptions = [
  { value: "10:00", label: "Morning · 10:00 AM" },
  { value: "14:00", label: "Afternoon · 2:00 PM" },
  { value: "18:00", label: "Evening · 6:00 PM" },
];
const durationOptions = [{ value: 120, label: "1–2 hours" }, { value: 240, label: "3–5 hours" }, { value: 420, label: "6–8 hours" }, { value: 720, label: "Full day" }];
type DestinationChoice = "city" | "area" | "elsewhere";

export function PlannerWizard({
  request,
  setRequest,
  step: requestedStep,
  setStep,
  onGenerate,
  onCancelGeneration,
  onLocationDetected,
  loading,
  serverError,
  loadingStage,
  theme = "red",
  editingPlan = false,
}: {
  request: PlanRequest;
  setRequest: Dispatch<SetStateAction<PlanRequest>>;
  step: number;
  setStep: (step: number) => void;
  onGenerate: () => Promise<void>;
  onCancelGeneration?: () => void;
  onLocationDetected: (location: DetectedLocation["location"]) => void;
  loading: boolean;
  serverError: string;
  loadingStage?: string;
  theme?: CompanionTheme;
  editingPlan?: boolean;
}) {
  const step = Math.max(0, Math.min(requestedStep, plannerQuestionCount - 1));
  const [error, setError] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ line: string; target: number } | null>(null);
  const transitioning = pending !== null || feedback !== null;
  const heading = useRef<HTMLHeadingElement>(null);
  const [reviewing, setReviewing] = useState(editingPlan && step !== plannerQuestionCount - 1);
  const [locating, setLocating] = useState(false);
  const [resolvingArea, setResolvingArea] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationMode, setLocationMode] = useState<"choose" | "manual" | "selected">(() => request.currentCity.trim() ? "selected" : "choose");
  const manualLocation = locationMode === "manual";
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null);
  const [destinationChoice, setDestinationChoice] = useState<DestinationChoice>(() => request.currentCity && request.city !== request.currentCity ? "elsewhere" : request.locationScope);
  const currentCity = request.currentCity || request.city;
  const locationController = useRef<AbortController | null>(null);
  useEffect(() => () => locationController.current?.abort(), []);
  function detectLocation() {
    if (!window.isSecureContext) { setLocationMessage("Location access needs a secure connection. Open this site with HTTPS, or choose your area manually."); return; }
    if (!navigator.geolocation) { setLocationMessage("Location detection isn't supported. Choose your area manually."); return; }
    locationController.current?.abort();
    const controller = new AbortController(); locationController.current = controller;
    setLocating(true); setResolvingArea(false); setLocationMessage("Allow location access when your browser asks."); setError("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      if (controller.signal.aborted) return;
      setResolvingArea(true); setLocationMessage("Location received. Finding your neighborhood…");
      try {
        const detected = await resolveLocation({ lat: position.coords.latitude, lng: position.coords.longitude }, controller.signal);
        if (controller.signal.aborted) return;
        setRequest((previous) => ({ ...previous, ...detected.location, currentCity: detected.location.city, area: detected.location.city, startingArea: detected.location.area, locationScope: "city", maxDistance: 30 }));
        setDestinationChoice("city");
        setDetectedLocation(detected); setLocationMode("selected");
        onLocationDetected(detected.location);
        setLocationMessage("");
      } catch (failure) { if (!controller.signal.aborted) setLocationMessage(failure instanceof Error ? failure.message : "We couldn't detect your area. Please try again or choose it manually."); }
      finally { if (!controller.signal.aborted) setLocating(false); }
    }, (failure) => { if (!controller.signal.aborted) { setLocating(false); setLocationMessage(browserLocationError(failure.code)); } }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  const stage = plannerQuestions[step];
  const title = editingPlan && stage.id === "review" ? "Edit your plan" : stage.title;
  const description = editingPlan && stage.id === "review" ? "Change any detail below, then update your date plan." : stage.description;
  const dialogue = usePlannerConversation(stage.id, request);
  const selectedCity = stage.id === "city" && locationMode === "selected";
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step, selectedCity]);
  function editLocation(mode: "choose" | "manual") {
    locationController.current?.abort();
    setLocating(false); setLocationMessage(""); setError(""); setLocationMode(mode);
  }
  function update<K extends keyof PlanRequest>(key: K, value: PlanRequest[K]) {
    if (["city", "country", "area"].includes(key)) { locationController.current?.abort(); setLocating(false); }
    setRequest((previous) => ({ ...previous, [key]: value, ...(["city", "country"].includes(key) ? { area: previous.locationScope === "city" ? previous.city : "", startingArea: "" } : {}) }));
    if (["city", "country"].includes(key)) setDetectedLocation(null);
    setError("");
  }
  function move(target: number) {
    if (
      transitioning ||
      loading ||
      target < 0 ||
      target >= plannerQuestionCount
    )
      return;
    locationController.current?.abort();
    setFeedback(null);
    setLocating(false);
    setError("");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      setStep(target);
    else setPending(target);
  }
  function advance(target: number, updated: PlanRequest) {
    if (transitioning || loading) return;
    const answer = stage.id === "vibes" ? updated.vibes.at(-1) : conversationAnswerKey(stage.id, updated);
    const line = dialogue?.ai ? dialogue.responses.find(({ key }) => key === answer)?.line : undefined;
    setFeedback({ target, line: line ?? localReaction(stage.id, updated) });
  }
  function next(updated = request) {
    if (transitioning || loading) return;
    if ((stage.id === "date" || stage.id === "review") && (!updated.date || updated.date < zonedNow(updated.timeZone).date)) { setError("Choose today or a future day for your date."); return; }
    if ((stage.id === "time" || stage.id === "review") && !updated.startTime) { setError("Choose a time for your date."); return; }
    if (stage.id === "time") { const issue = scheduleError({ ...updated, endTime: "" }); if (issue) { setError(issue); return; } }
    if (stage.id === "review") { const issue = scheduleError(updated); if (issue) { setError(issue); return; } }
    if (stage.id === "city" && (locationMode === "choose" || locating)) {
      setError(locating ? "Finding your area. Please wait a moment." : "Use your location or choose an area manually to continue.");
      return;
    }
    const parsed = requestSchema.safeParse(updated);
    if (!parsed.success) {
      const fields = new Set<string>(stage.fields);
      const issue = parsed.error.issues.find((issue) =>
        fields.has(String(issue.path[0])),
      );
      if (issue) {
        const messages: Partial<
          Record<(typeof plannerQuestions)[number]["id"], string>
        > = {
          city: "Enter a city and country with at least two characters.",
          area: "Choose a destination and a search reach before continuing.",
          budget: "Enter a budget between ₦1,000 and ₦10,000,000.",
          people: "Choose a whole number of people between 1 and 12.",
          vibes: "Choose at least one vibe to keep going.",
          date: "Choose a valid day for your date.",
          time: "Choose a valid starting time.",
        };
        setError(messages[stage.id] ?? issue.message);
        return;
      }
      if (step === plannerQuestionCount - 1) {
        setError(
          "A previous answer needs another look. Use Back to check your answers.",
        );
        return;
      }
    }
    if (stage.id === "city" && manualLocation) {
      setError("");
      setRequest((previous) => ({ ...previous, currentCity: (updated.currentCity || updated.city).trim() }));
      setLocationMode("selected");
      setLocationMessage("");
      return;
    }
    if (
      stage.id === "duration" &&
      updated.endTime &&
      updated.endTime <= updated.startTime
    ) {
      setError("Your ending time must be after your starting time.");
      return;
    }
    if (step === plannerQuestionCount - 1) void onGenerate();
    else if (reviewing && stage.id === "city") advance(plannerQuestions.findIndex((question) => question.id === "area"), updated);
    else if (reviewing) { setReviewing(false); advance(plannerQuestionCount - 1, updated); }
    else advance(step + 1, updated);
  }
  function choose<K extends keyof PlanRequest>(key: K, value: PlanRequest[K]) {
    if (transitioning || loading) return;
    const updated = { ...request, [key]: value };
    setRequest(updated);
    next(updated);
  }
  function openBudget() {
    update("budget", request.budget ?? 60000);
  }
  function toggleVibe(vibe: PlanRequest["vibes"][number]) {
    if (transitioning) return;
    update(
      "vibes",
      request.vibes.includes(vibe)
        ? request.vibes.filter((item) => item !== vibe)
        : [...request.vibes, vibe],
    );
  }
  function setOriginCity(city: string) {
    locationController.current?.abort(); setLocating(false); setDetectedLocation(null); setError(""); setDestinationChoice("city");
    setRequest((previous) => ({ ...previous, currentCity: city, city, area: city, startingArea: "", locationScope: "city", maxDistance: 30 }));
  }
  function chooseDestination(choice: DestinationChoice) {
    setDestinationChoice(choice); setError("");
    setRequest((previous) => {
      const home = previous.currentCity || previous.city;
      return { ...previous, currentCity: home, city: choice === "elsewhere" ? "" : home, area: choice === "city" ? home : "", locationScope: choice === "area" ? "area" : "city", startingArea: choice === "elsewhere" ? "" : detectedLocation?.location.area || "", maxDistance: choice === "area" ? 15 : 30 };
    });
  }
  function setDestinationCity(city: string) {
    setError("");
    setRequest((previous) => ({ ...previous, city, area: city, startingArea: "" }));
  }
  function shortcut(event: KeyboardEvent<HTMLFormElement>) {
    if (
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const target = event.target;
    const editing =
      target instanceof HTMLElement &&
      !!target.closest("input,textarea,select,summary");
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !(target instanceof HTMLButtonElement) &&
      !(target instanceof HTMLSelectElement) &&
      !(target instanceof HTMLElement && target.closest("summary"))
    ) {
      event.preventDefault();
      if (!event.repeat) next();
      return;
    }
    if (editing || event.repeat || transitioning) return;
    const index = event.key.toUpperCase().charCodeAt(0) - 65;
    if (event.key.length !== 1 || index < 0) return;
    if (stage.id === "occasion" && occasions[index]) {
      event.preventDefault();
      choose("occasion", occasions[index]);
    }
    if (stage.id === "budget" && index < 2) {
      event.preventDefault();
      if (index === 0) openBudget();
      else choose("budget", null);
    }
    if ((stage.id === "yourGender" || stage.id === "dateGender") && genderOptions[index]) {
      event.preventDefault();
      choose(stage.id, genderOptions[index].value);
    }
    if (stage.id === "vibes" && vibes[index]) {
      event.preventDefault();
      toggleVibe(vibes[index]);
    }
    if (stage.id === "time" && timeOptions[index]) {
      event.preventDefault();
      choose("startTime", timeOptions[index].value);
    }
    if (stage.id === "duration" && durationOptions[index]) {
      event.preventDefault();
      choose("duration", durationOptions[index].value);
    }
  }
  const reviewGroups = [
    { id: "yourGender", label: "Your gender", value: genderLabel(request.yourGender) },
    { id: "dateGender", label: "Your date's gender", value: genderLabel(request.dateGender) },
    { id: "city", label: "Your current city", value: `${currentCity}, ${request.country}` },
    { id: "area", label: "Date destination", value: `${request.locationScope === "city" ? `Across ${request.city}` : `${request.area}, ${request.city}`} · ${request.maxDistance} km search reach` },
    { id: "occasion", label: "Occasion", value: request.occasion },
    { id: "people", label: "Guests", value: `${request.guests} people` },
    { id: "vibes", label: "Vibe", value: request.vibes.join(", ") },
    { id: "interests", label: "Interests & preferences", value: [request.interests, request.notes, request.surprises ? "Surprises welcome" : "No surprises"].filter(Boolean).join(" · ") },
    { id: "requirements", label: "Requirements", value: [...request.dietary, request.quiet ? "Quiet places" : "", request.accessibility ? "Step-free access" : "", request.dislikes ? `Avoid: ${request.dislikes}` : ""].filter(Boolean).join(" · ") || "None specified" },
    { id: "budget", label: "Spending limit", value: request.budget === null ? "No spending limit set" : `${money(request.budget)} ${request.budgetType === "total" ? "total" : "per person"} · ${request.includeFood ? "Food included" : "Food excluded"} · ${request.includeTransport ? "Transport included" : "Transport excluded"}` },
    { id: "date", label: "Date", value: request.date ? calendarLabel(request.date) : "Choose a day" },
    { id: "time", label: "Starting time", value: request.startTime || "Choose a time" },
    { id: "duration", label: "Duration", value: `${request.duration / 60} hours${request.endTime ? ` · Be back by ${request.endTime}` : ""}` },
  ];
  const total =
    (request.budget ?? 0) * (request.budgetType === "per-person" ? request.guests : 1);
  if (loading) return <GeneratingScreen stage={loadingStage} theme={theme} onCancel={onCancelGeneration} />;
  if (feedback) return <PlannerReaction key={feedback.target} line={feedback.line} theme={theme} onComplete={() => { setStep(feedback.target); setFeedback(null); }} />;
  return (
    <main className={`typeform-shell ${styles.wizard} ${stage.id === "review" ? "planner-review" : ""}`}>
      {(step > 0 || reviewing) && !(editingPlan && stage.id === "review") && <div className="typeform-stage-bar">
        <button
          type="button"
          className="typeform-back"
          disabled={transitioning}
          onClick={() => { if (reviewing) { setReviewing(false); move(plannerQuestionCount - 1); } else move(step - 1); }}
        >
          {reviewing ? editingPlan ? "Back to edit plan" : "Back to review" : "Back"}
        </button>
      </div>}
      <div
        className="planner-progress"
        role="progressbar"
        aria-label="Planning questions"
        aria-valuemin={0}
        aria-valuemax={plannerQuestionCount}
        aria-valuenow={step + 1}
      >
        <span
          style={{ width: `${((step + 1) / plannerQuestionCount) * 100}%` }}
        />
      </div>
      <form
        className={`typeform-stage ${stage.id === "city" ? "location-stage" : ""} ${selectedCity ? "location-selected" : ""} ${pending === null ? `question-enter ${styles.enter}` : "question-exit-forward"}`}
        key={step}
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        onKeyDown={shortcut}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && pending !== null) {
            setStep(pending);
            setPending(null);
            setFeedback(null);
          }
        }}
      >
        <div className="question-intro">
          <div className="question-heading">
            <span className="eyebrow">YOUR DATE, YOUR WAY</span>
            <h1 ref={heading} tabIndex={-1} aria-label={title}>{title.split(/\s+/).map((word, index) => <Fragment key={`${word}-${index}`}><span className={styles.questionWord}><span style={{ "--question-delay": `${index * 35}ms` } as CSSProperties}>{word}</span></span>{" "}</Fragment>)}</h1>
          </div>
        </div>
        <p className="typeform-description">{description}</p>
        <fieldset className="typeform-answer" disabled={transitioning}>
          {selectedCity && <div className="detected-location" role="status"><strong>{currentCity}</strong><p>{request.country}</p></div>}
          {stage.id === "review" && <div className="review-answers">{reviewGroups.map((item) => <div className="review-answer" key={item.id}><div><small>{item.label}</small><p>{item.value}</p></div><button type="button" onClick={() => { setReviewing(true); move(plannerQuestions.findIndex((question) => question.id === item.id)); }}>Edit {item.label.toLowerCase()}</button></div>)}</div>}
          {stage.id === "city" && !selectedCity && (
            <>
              <div className="location-methods">
                <Button type="button" disabled={locating || pending !== null} onClick={detectLocation}>{locating ? resolvingArea ? "Finding your area…" : "Getting your location…" : "Use My Location"}</Button>
                <span>or</span>
                <button type="button" className="location-manual-toggle" aria-expanded={manualLocation} aria-controls="manual-location" onClick={() => editLocation(manualLocation ? "choose" : "manual")}>{manualLocation ? "Hide manual selection" : "Choose manually"}</button>
                {locationMessage && <p role="status">{locationMessage}</p>}
              </div>
              {manualLocation && <div className="location-manual typeform-answer" id="manual-location">
              <Field label="Your current city">
                <input
                  list="atlas-cities"
                  value={currentCity}
                  maxLength={80}
                  onChange={(event) => setOriginCity(event.target.value)}
                  placeholder="Type your city…"
                  autoComplete="address-level2"
                />
                <datalist id="atlas-cities">
                  {cities.map((city) => (
                    <option key={city}>{city}</option>
                  ))}
                </datalist>
              </Field>
              <div className="typeform-suggestions">
                {cities.map((city) => (
                  <button
                    type="button"
                    key={city}
                    disabled={locating || pending !== null}
                    onClick={() => { const updated = { ...request, currentCity: city, city, area: city, startingArea: "", locationScope: "city" as const, maxDistance: 30 }; setDetectedLocation(null); setDestinationChoice("city"); setRequest(updated); next(updated); }}
                  >
                    {city}
                  </button>
                ))}
              </div>
              <details className="flow-details">
                <summary>Planning in {request.country}? Change country</summary>
                <Field label="Country">
                  <input
                    value={request.country}
                    maxLength={80}
                    autoComplete="country-name"
                    onChange={(event) => update("country", event.target.value)}
                  />
                </Field>
              </details>
              </div>}
            </>
          )}
          {stage.id === "area" && (
            <>
              <div className="horizon-origin"><span>YOUR STARTING POINT</span><strong>{currentCity}, {request.country}</strong></div>
              <div className="horizon-options">
                {([
                  { value: "city", title: `Explore ${currentCity}`, detail: "Beautiful possibilities across the city, beyond your usual spots." },
                  { value: "area", title: "A neighborhood I have in mind", detail: "Choose a part of the city you would love to explore." },
                  { value: "elsewhere", title: "Take us to another city", detail: "A different backdrop. A new story to tell." },
                ] as const).map((choice, index) => <button type="button" key={choice.value} className={`horizon-choice ${destinationChoice === choice.value ? "is-selected" : ""}`} aria-pressed={destinationChoice === choice.value} onClick={() => chooseDestination(choice.value)}>
                  <span className="horizon-number">0{index + 1}</span><span><strong>{choice.title}</strong><small>{choice.detail}</small></span><span className="horizon-radio" aria-hidden="true" />
                </button>)}
              </div>
              {destinationChoice === "elsewhere" && <>
                <Field label="Where would you love to go?"><input list="atlas-destination-cities" value={request.city} maxLength={80} autoComplete="off" onChange={(event) => setDestinationCity(event.target.value)} placeholder="Choose or type a destination city…" /></Field>
                <datalist id="atlas-destination-cities">{cities.map((city) => <option key={city}>{city}</option>)}</datalist>
                <NearbyCities key={`${request.country}:${currentCity}`} city={currentCity} country={request.country} selectedCity={request.city} onSelect={setDestinationCity} />
                <small className="answer-help">Travel to another city is separate from this plan. Transportation estimates cover journeys within your date city.</small>
              </>}
              {destinationChoice === "area" && <>
                <Field label={`Which part of ${currentCity}?`}><input list="atlas-areas" value={request.area} maxLength={80} onChange={(event) => update("area", event.target.value)} placeholder="Type a neighborhood…" /></Field>
                <datalist id="atlas-areas">{[...new Set([...(detectedLocation?.suggestedAreas ?? []), ...(request.city === "Lagos" && request.country === "Nigeria" ? areas : [])])].map((area) => <option key={area}>{area}</option>)}</datalist>
                <div className="typeform-suggestions">{[...new Set([...(detectedLocation?.suggestedAreas ?? []), ...(request.city === "Lagos" && request.country === "Nigeria" ? areas : [])])].map((area) => <button type="button" key={area} onClick={() => update("area", area)}>{area}</button>)}</div>
              </>}
              <div className="horizon-reach"><span>GIVE YOUR DATE A LITTLE ROOM</span><div>{[5, 15, 30, 50].map((distance) => <button type="button" key={distance} aria-pressed={request.maxDistance === distance} onClick={() => update("maxDistance", distance)}>{distance} km</button>)}</div><small>{request.locationScope === "city" ? "Search across your destination city, within this reach of its center." : "Search within this reach of your chosen neighborhood."}</small></div>
              <details className="flow-details">
                <summary>Travel preferences</summary>
                <div className="form-stack">
                  <Field label={`Starting area in ${request.city || "your destination city"} (optional)`}><input value={request.startingArea} maxLength={80} onChange={(event) => update("startingArea", event.target.value)} placeholder="Where you'll meet before the date" /></Field>
                  <Field label="Getting around"><select value={request.transport} onChange={(event) => update("transport", event.target.value as PlanRequest["transport"])}><option>Ride-hailing</option><option>Driving</option><option>Walking</option></select></Field>
                  <label className="plain-toggle"><input type="checkbox" checked={request.meetingTogether} onChange={(event) => update("meetingTogether", event.target.checked)} />We&apos;re traveling together</label>
                </div>
              </details>
            </>
          )}
          {stage.id === "occasion" && (
            <>
              <AnswerChoices
                options={occasions.map((value) => ({ value, label: value }))}
                selected={[request.occasion]}
                disabled={pending !== null}
                onChoose={(value) => choose("occasion", value)}
              />
              <details className="flow-details">
                <summary>A different reason to celebrate?</summary>
                <Field label="Your occasion">
                  <input
                    value={
                      occasions.some((item) => item === request.occasion)
                        ? ""
                        : request.occasion
                    }
                    maxLength={100}
                    onChange={(event) => update("occasion", event.target.value)}
                    placeholder="Tell us your occasion…"
                  />
                </Field>
              </details>
            </>
          )}
          {stage.id === "budget" && (
            <>
              <AnswerChoices
                options={[{ value: "yes", label: "Yes, let's set a budget" }, { value: "no", label: "No, keep my options open" }]}
                selected={[request.budget === null ? "no" : "yes"]}
                disabled={pending !== null}
                onChoose={(value) => value === "no" ? choose("budget", null) : openBudget()}
              />
              {request.budget !== null && <div className="typeform-answer" aria-label="Your budget range">
                <label className="field"><span>{request.budgetType === "per-person" ? "Budget per person" : request.guests === 2 ? "Total budget for both of you" : `Total budget for ${request.guests} people`}: {money(request.budget)}</span><input className="budget-slider" type="range" min="1000" max="300000" step="1000" value={Math.min(request.budget, 300000)} onChange={(event) => update("budget", Number(event.target.value))} aria-label={request.budgetType === "per-person" ? "Budget per person" : `Total budget for ${request.guests} people`} /></label>
                <div className="budget-presets">{budgetOptions.map((option) => <button type="button" className={`filter-pill ${request.budget === option.value ? "active" : ""}`} aria-pressed={request.budget === option.value} key={option.value} onClick={() => update("budget", option.value)}>{option.label}</button>)}</div>
                <Field label="Or your own amount (₦)">
                  <input type="number" min={1000} max={10000000} value={request.budget || ""} onChange={(event) => update("budget", Number(event.target.value))} />
                </Field>
                <details className="flow-details">
                  <summary>What should the budget include?</summary>
                  <div className="form-stack">
                    <Field label="Your budget is">
                      <select
                        value={request.budgetType}
                        onChange={(event) =>
                          update(
                            "budgetType",
                            event.target.value as PlanRequest["budgetType"],
                          )
                        }
                      >
                        <option value="total">For everyone</option>
                        <option value="per-person">Per person</option>
                      </select>
                    </Field>
                    {(
                      [
                        {
                          key: "includeFood",
                          label: "Include a meal and drinks",
                        },
                        {
                          key: "includeTransport",
                          label: "Include transportation",
                        },
                        { key: "contingency", label: "Include a 10% cushion" },
                      ] as const
                    ).map(({ key, label }) => (
                      <label className="plain-toggle" key={key}>
                        <input
                          type="checkbox"
                          checked={request[key]}
                          onChange={(event) => update(key, event.target.checked)}
                        />
                        {label}
                      </label>
                    ))}
                    <p className="answer-help">
                      Your total spending ceiling is {money(total)}. Confirm estimated venue and transport costs before committing.
                    </p>
                  </div>
                </details>
              </div>}
            </>
          )}
          {stage.id === "people" && (
            <>
              <AnswerChoices options={[{ value: 2, label: "Just us two" }, { value: 4, label: "A double date" }, { value: 6, label: "A little group" }]} selected={[request.guests]} onChoose={(value) => choose("guests", value)} disabled={transitioning} />
              <Field label="Number of people">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={request.guests || ""}
                  onChange={(event) =>
                    update("guests", Number(event.target.value))
                  }
                />
              </Field>
            </>
          )}
          {(stage.id === "yourGender" || stage.id === "dateGender") && <GenderChoices
            selected={request[stage.id]}
            disabled={pending !== null}
            onChoose={(value) => {
              if (stage.id === "yourGender" || stage.id === "dateGender") choose(stage.id, value);
            }}
          />}
          {stage.id === "vibes" && (
            <>
              <VibeChoices selected={request.vibes} onToggle={toggleVibe} disabled={pending !== null} />
              <p className="answer-help">
                {request.vibes.length} selected. Choose as many as you like.
              </p>
            </>
          )}
          {stage.id === "interests" && (
            <>
              <Field label="The things they love">
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={request.interests}
                  onChange={(event) => update("interests", event.target.value)}
                  placeholder="Art, good food, quiet corners, a little adventure…"
                />
              </Field>
              <div className="typeform-suggestions">
                {["Art & galleries", "Good food", "Nature", "Quiet places"].map(
                  (interest) => (
                    <button
                      type="button"
                      key={interest}
                      onClick={() =>
                        update(
                          "interests",
                          [request.interests, interest]
                            .filter(Boolean)
                            .join(", ")
                            .slice(0, 1000),
                        )
                      }
                    >
                      + {interest}
                    </button>
                  ),
                )}
              </div>
              <small className="answer-help">
                Shift + Enter for a new line.
              </small>
              <details className="flow-details">
                <summary>Additional preferences{request.notes ? " · Extra instructions added" : " (optional)"}</summary>
                <div className="form-stack">
                  <Field label="Extra instructions">
                    <textarea rows={3} value={request.notes} maxLength={2000} onChange={(event) => update("notes", event.target.value)} placeholder="A thoughtful surprise or a detail we should keep in mind…" />
                  </Field>
                  <label className="plain-toggle"><input type="checkbox" checked={request.surprises} onChange={(event) => update("surprises", event.target.checked)} />A little surprise would be lovely</label>
                </div>
              </details>
            </>
          )}
          {stage.id === "requirements" && (
            <div className="form-stack">
              <div className="pill-group">
                {(["vegetarian", "vegan", "halal", "gluten-free"] as const).map(
                  (diet) => (
                    <button
                      type="button"
                      key={diet}
                      className={`filter-pill ${request.dietary.includes(diet) ? "active" : ""}`}
                      aria-pressed={request.dietary.includes(diet)}
                      onClick={() =>
                        update(
                          "dietary",
                          request.dietary.includes(diet)
                            ? request.dietary.filter((item) => item !== diet)
                            : [...request.dietary, diet],
                        )
                      }
                    >
                      {diet}
                    </button>
                  ),
                )}
              </div>
              <label className="plain-toggle">
                <input
                  type="checkbox"
                  checked={request.quiet}
                  onChange={(event) => update("quiet", event.target.checked)}
                />
                Quiet, conversation-friendly places
              </label>
              <label className="plain-toggle">
                <input
                  type="checkbox"
                  checked={request.accessibility}
                  onChange={(event) =>
                    update("accessibility", event.target.checked)
                  }
                />
                Step-free access required
              </label>
              <details className="flow-details">
                <summary>Anything you&apos;d rather skip?</summary>
                <Field label="Activities or settings to avoid">
                  <input
                    value={request.dislikes}
                    maxLength={500}
                    onChange={(event) => update("dislikes", event.target.value)}
                    placeholder="e.g. crowded places or arcades"
                  />
                </Field>
              </details>
            </div>
          )}
          {stage.id === "date" && (
            <DatePicker timeZone={request.timeZone} value={request.date} disabled={transitioning} onChange={(date) => { setRequest((previous) => ({ ...previous, date, datePreference: [0, 6].includes(calendarDay(date)) ? "weekend" : "weekday" })); setError(""); }} />
          )}
          {stage.id === "time" && (
            <>
              <AnswerChoices
                options={timeOptions}
                selected={[request.startTime]}
                disabled={pending !== null}
                onChoose={(value) => choose("startTime", value)}
              />
              <Field label="Choose a time · venue local time">
                <input
                  type="time"
                  value={request.startTime}
                  onChange={(event) => update("startTime", event.target.value)}
                />
              </Field>
            </>
          )}
          {stage.id === "duration" && (
            <>
              <AnswerChoices
                options={durationOptions}
                selected={[request.duration]}
                disabled={pending !== null}
                onChoose={(value) => choose("duration", value)}
              />
              <Field label="Custom duration (hours)"><input type="number" min={1} max={12} step={0.5} value={request.duration / 60} onChange={(event) => { const hours = event.target.valueAsNumber; if (Number.isFinite(hours)) update("duration", Math.round(hours * 60)); }} /><small>We&apos;ll plan for {request.duration / 60} hours, including estimated travel.</small></Field>
              <details className="flow-details">
                <summary>A little more about the timing and setting</summary>
                <div className="form-stack">
                  <Field label="Be back by (optional)">
                    <input
                      type="time"
                      value={request.endTime}
                      onChange={(event) =>
                        update("endTime", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Indoors or outdoors?">
                    <select
                      value={request.environment}
                      onChange={(event) =>
                        update(
                          "environment",
                          event.target.value as PlanRequest["environment"],
                        )
                      }
                    >
                      <option value="any">A little of either</option>
                      <option value="indoor">Indoors</option>
                      <option value="outdoor">Outdoors</option>
                    </select>
                  </Field>
                  <label className="plain-toggle">
                    <input
                      type="checkbox"
                      checked={request.flexible}
                      onChange={(event) =>
                        update("flexible", event.target.checked)
                      }
                    />
                    We can be flexible with the time
                  </label>
                </div>
              </details>
            </>
          )}
        </fieldset>
        {(error || serverError) && (
          <p className="error-message" role="alert">
            {error || serverError}
          </p>
        )}
        {(stage.id !== "city" || locationMode !== "choose") && <div className="typeform-confirm">
          <Button type="submit" disabled={transitioning || locating}>
            {stage.id === "city" && manualLocation ? "Use this city" : selectedCity ? "Continue" : step === plannerQuestionCount - 1 ? editingPlan ? "Update My Date Plan" : "Create My Date Plan" : reviewing ? editingPlan ? "Back to edit plan" : "Back to review" : "Continue"}
          </Button>
          {selectedCity ? <Button type="button" variant="outline" disabled={pending !== null} onClick={() => editLocation("choose")}>Change</Button> : <span>
            press <strong>Enter</strong>
          </span>}
        </div>}
      </form>
    </main>
  );
}
