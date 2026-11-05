"use client";

import { useDestinationTimeZone } from "./use-destination-time-zone";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { GeneratingScreen } from "./generating-screen";
import { NearbyCities } from "./nearby-cities";
import { ManualCityPicker } from "./manual-city-picker";
import { LocationPermissionHelp } from "./location-permission-help";
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
import { intakeFieldForQuestion, wizardQuestionSteps, type IntakeField } from "@/lib/planner/intake";
import { funnelScope, trackFunnel } from "@/lib/planner/funnel-client";
import type { PlannerQuestionId } from "@/lib/planner/questions";
import type { CompanionTheme } from "@/lib/animations/registry";
import type { DetectedLocation } from "@/lib/maps/schema";
import { BrowserLocationFailure, getBrowserCoordinates, resolveCountry, resolveLocation } from "@/lib/maps/client-location";
import { requirementsGuidance } from "@/lib/planner/search-feedback";
import { plannerValidationIssues } from "@/lib/planner/validation";
import { budgetSuggestions, currencyDigits, currencyOptions, destinationCurrency } from "@/lib/planner/currency";

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

function PreferenceTiles<T extends string | boolean>({ label, name, options, selected, onChoose }: {
  label: string;
  name: string;
  options: readonly { label: string; value: T }[];
  selected: T;
  onChoose: (value: T) => void;
}) {
  return <fieldset className={styles.preferenceGroup}>
    <legend>{label}</legend>
    <div className="typeform-choices">
      {options.map(option => <label key={String(option.value)} className={`typeform-choice ${styles.preferenceTile} ${selected === option.value ? "is-selected" : ""}`}>
        <input type="radio" name={name} value={String(option.value)} checked={selected === option.value} onChange={() => onChoose(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

type DestinationChoice = "city" | "area" | "elsewhere";

function ReviewScrollCue() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let dismissed = false;
    let previousScrollY = window.scrollY;
    const update = () => {
      if (dismissed) return;
      const page = document.scrollingElement;
      setVisible(!!page && page.scrollHeight - window.innerHeight - window.scrollY > 32);
    };
    const dismiss = () => { dismissed = true; setVisible(false); };
    const onScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY > previousScrollY) dismiss();
      previousScrollY = scrollY;
    };
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    const frame = requestAnimationFrame(update);
    const timer = window.setTimeout(dismiss, 5000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);
  return visible ? <div className={styles.scrollCue} aria-hidden="true"><ArrowDown size={24} /></div> : null;
}

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
  answered = [],
  onAnswer,
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
  answered?: readonly IntakeField[];
  onAnswer?: (id: PlannerQuestionId, request: PlanRequest) => void;
}) {
  const step = Math.max(0, Math.min(requestedStep, plannerQuestionCount - 1));
  const budgetOptions = budgetSuggestions(request.currency).map((value) => ({ value, label: money(value, request.currency) }));
  const [initialAnswers] = useState(() => answered);
  const questionSteps = [...new Set([...wizardQuestionSteps(request, initialAnswers), step])].sort((a, b) => a - b);
  const position = questionSteps.indexOf(step);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ line: string; target: number } | null>(null);
  const transitioning = pending !== null || feedback !== null;
  const heading = useRef<HTMLHeadingElement>(null);
  const [reviewing, setReviewing] = useState(editingPlan && step !== plannerQuestionCount - 1);
  const [locating, setLocating] = useState(false);
  const [resolvingArea, setResolvingArea] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationSettingsNeeded, setLocationSettingsNeeded] = useState(false);
  const [locationMode, setLocationMode] = useState<"choose" | "manual" | "selected">(() => request.currentCity.trim() ? "selected" : "choose");
  const manualLocation = locationMode === "manual";
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null);
  const [estimatedCountry, setEstimatedCountry] = useState("");
  const countryResolved = useRef(editingPlan || !!request.currentCity.trim() || !!request.country.trim() && request.country !== "Nigeria");
  const initialCountry = useRef(request.country);
  const [destinationChoice, setDestinationChoice] = useState<DestinationChoice>(() => request.currentCity && request.city !== request.currentCity ? "elsewhere" : request.locationScope);
  const currentCity = request.currentCity || request.city;
  const locationController = useRef<AbortController | null>(null);
  useEffect(() => () => locationController.current?.abort(), []);
  useEffect(() => {
    if (countryResolved.current) return;
    const controller = new AbortController();
    void resolveCountry(controller.signal).then((country) => {
      if (!country || controller.signal.aborted || countryResolved.current) return;
      countryResolved.current = true;
      setRequest((previous) => previous.currentCity.trim() || previous.country !== initialCountry.current ? previous : destinationCurrency(previous, country.name));
      setEstimatedCountry(country.name);
    }).catch(() => { /* Country selection remains available if the network has no estimate. */ });
    return () => controller.abort();
  }, [setRequest]);
  async function detectLocation() {
    setLocationSettingsNeeded(false);
    if (!window.isSecureContext) { setLocationMessage("Location access needs a secure connection. Open this site with HTTPS, or choose your area manually."); return; }
    if (!navigator.geolocation) { setLocationMessage("Location detection isn't supported. Choose your area manually."); return; }
    locationController.current?.abort();
    const controller = new AbortController(); locationController.current = controller;
    setLocating(true); setResolvingArea(false); setLocationMessage("Allow location access when your browser asks."); setError("");
    try {
      const coordinates = await getBrowserCoordinates(controller.signal);
      if (controller.signal.aborted) return;
      setResolvingArea(true); setLocationMessage("Finding your city…");
      const detected = await resolveLocation(coordinates, controller.signal);
      if (controller.signal.aborted) return;
      setRequest((previous) => ({ ...destinationCurrency(previous, detected.location.country), ...detected.location, timeZoneConfirmed: false, currentCity: detected.location.city, area: detected.location.city, startingArea: detected.location.area, locationScope: "city", maxDistance: 30 }));
      countryResolved.current = true; setEstimatedCountry("");
      setDestinationChoice("city");
      setDetectedLocation(detected); setLocationMode("selected");
      onLocationDetected(detected.location);
      setLocationMessage("");
    } catch (failure) {
      if (!controller.signal.aborted) {
        setLocationMessage(failure instanceof Error ? failure.message : "We couldn't detect your area. Please try again or choose it manually.");
        setLocationSettingsNeeded(failure instanceof BrowserLocationFailure && (failure.code === 1 || failure.code === 2));
      }
    } finally { if (!controller.signal.aborted) setLocating(false); }
  }
  const stage = plannerQuestions[step];
  useDestinationTimeZone(request, setRequest, ["date", "time", "review"].includes(stage.id));
  useEffect(() => { const field = intakeFieldForQuestion(stage.id); if (field) trackFunnel("planner_step_viewed", funnelScope(`step:${field}`), undefined, field); }, [stage.id]);
  const title = editingPlan && stage.id === "review" ? "What would you like to change?" : stage.title;
  const description = editingPlan && stage.id === "review" ? "Your other answers are kept. Change what you need, then find a fresh match." : stage.description;
  const dialogue = usePlannerConversation(stage.id, request);
  const selectedCity = stage.id === "city" && locationMode === "selected";
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step, selectedCity]);
  function editLocation(mode: "choose" | "manual") {
    locationController.current?.abort();
    setLocating(false); setLocationMessage(""); setLocationSettingsNeeded(false); setError(""); setLocationMode(mode);
    if (mode === "manual") setRequest((previous) => previous.currentCity.trim() ? previous : { ...previous, city: "", area: "", startingArea: "" });
  }
  function update<K extends keyof PlanRequest>(key: K, value: PlanRequest[K]) {
    if (["city", "country", "area"].includes(key)) { locationController.current?.abort(); setLocating(false); }
    setRequest((previous) => ({ ...previous, [key]: value, ...(["city", "country"].includes(key) ? { timeZoneConfirmed: false, area: previous.locationScope === "city" ? key === "city" && typeof value === "string" ? value : previous.city : "", startingArea: "" } : {}), ...(key === "startTime" && value !== previous.startTime ? { endTime: "" } : {}) }));
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
    if (stage.id === "review") {
      const issues = plannerValidationIssues(updated);
      if (issues.length) { setError(issues[0].message); return; }
    }
    if ((stage.id === "date" || stage.id === "review") && (!updated.date || updated.date < zonedNow(updated.timeZone).date)) { setError("Choose today or a future day for your date."); return; }
    if ((stage.id === "time" || stage.id === "review") && !updated.startTime) { setError("Choose a time for your date."); return; }
    if (stage.id === "time") { const issue = scheduleError({ ...updated, timeZoneConfirmed: true, endTime: "" }); if (issue) { setError(issue); return; } }
    if (stage.id === "review") { const issue = scheduleError({ ...updated, timeZoneConfirmed: true, endTime: "" }); if (issue) { setError(issue); return; } }
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
          budget: `Enter an amount from 0 to ${money(10000000, request.currency)}.`,
          people: "Choose a whole number of people between 1 and 12.",
          vibes: "Choose at least one vibe to keep going.",
          date: "Choose a valid day for your date.",
          time: "Choose a valid starting time.",
        };
        setError(messages[stage.id] ?? issue.message);
        return;
      }
      if (step === plannerQuestionCount - 1) {
        setError(plannerValidationIssues(updated)[0]?.message ?? "Review the highlighted answers before planning.");
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
    onAnswer?.(stage.id, updated);
    if (step === plannerQuestionCount - 1) void onGenerate();
    else if (reviewing && stage.id === "city") advance(plannerQuestions.findIndex((question) => question.id === "area"), updated);
    else if (reviewing) { setReviewing(false); advance(plannerQuestionCount - 1, updated); }
    else advance(questionSteps[position + 1] ?? plannerQuestionCount - 1, updated);
  }
  function choose<K extends keyof PlanRequest>(key: K, value: PlanRequest[K]) {
    if (transitioning || loading) return;
    const updated = { ...request, [key]: value };
    setRequest(updated);
    next(updated);
  }
  function openBudget() {
    update("budget", request.budget ?? budgetSuggestions(request.currency)[2]);
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
    countryResolved.current = true;
    locationController.current?.abort(); setLocating(false); setDetectedLocation(null); setError(""); setDestinationChoice("city");
    setRequest((previous) => ({ ...previous, timeZoneConfirmed: false, currentCity: city, city, area: city, startingArea: "", locationScope: "city", maxDistance: 30 }));
  }
  function setOriginCountry(country: string) {
    countryResolved.current = true; setEstimatedCountry("");
    locationController.current?.abort(); setLocating(false); setDetectedLocation(null); setError(""); setDestinationChoice("city");
    setRequest((previous) => ({ ...destinationCurrency(previous, country), currentCity: "", city: "", area: "", startingArea: "", locationScope: "city", maxDistance: 30 }));
  }
  function chooseDestination(choice: DestinationChoice) {
    setDestinationChoice(choice); setError("");
    setRequest((previous) => {
      const home = previous.currentCity || previous.city;
      return { ...previous, timeZoneConfirmed: false, currentCity: home, city: choice === "elsewhere" ? "" : home, area: choice === "city" ? home : "", locationScope: choice === "area" ? "area" : "city", startingArea: choice === "elsewhere" ? "" : detectedLocation?.location.area || "", maxDistance: choice === "area" ? 15 : 30 };
    });
  }
  function setDestinationCity(city: string) {
    setError("");
    setRequest((previous) => ({ ...previous, timeZoneConfirmed: false, city, area: city, startingArea: "" }));
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
    { id: "requirements", label: "Place preferences", value: [request.environment === "indoor" ? "Indoors" : request.environment === "outdoor" ? "Outdoors" : "", request.quiet ? "Quiet enough to talk" : "", request.accessibility ? "Step-free entrance required" : "", request.dislikes ? `Avoid: ${request.dislikes}` : "", ...request.dietary].filter(Boolean).join(" · ") || "No additional preferences" },
    { id: "budget", label: "Spending limit", value: request.budget === null ? "No spending limit set" : `${money(request.budget, request.currency)} ${request.budgetType === "total" ? "total" : "per person"} · ${request.includeFood ? "Food included" : "Food excluded"} · ${request.includeTransport ? "Transport included" : "Transport excluded"}` },
    { id: "date", label: "Date", value: request.date ? calendarLabel(request.date) : "Choose a day" },
    { id: "time", label: "Starting time", value: request.startTime || "Choose a time" },
  ];
  const total =
    (request.budget ?? 0) * (request.budgetType === "per-person" ? request.guests : 1);
  const reviewIssues = stage.id === "review" ? plannerValidationIssues(request) : [];
  if (loading) return <GeneratingScreen stage={loadingStage} theme={theme} onCancel={onCancelGeneration} />;
  if (feedback) return <PlannerReaction key={feedback.target} line={feedback.line} theme={theme} onComplete={() => { setStep(feedback.target); setFeedback(null); }} />;
  return (
    <main className={`typeform-shell ${styles.wizard} ${stage.id === "review" ? "planner-review" : ""}`}>
      {(position > 0 || reviewing) && !(editingPlan && stage.id === "review") && <div className="typeform-stage-bar">
        <button
          type="button"
          className="typeform-back"
          disabled={transitioning}
          onClick={() => { if (reviewing) { setReviewing(false); move(plannerQuestionCount - 1); } else move(questionSteps[position - 1] ?? 0); }}
        >
          {reviewing ? editingPlan ? "Back to edit plan" : "Back to review" : "Back"}
        </button>
      </div>}
      <div
        className="planner-progress"
        role="progressbar"
        aria-label="Planning questions"
        aria-valuemin={0}
        aria-valuemax={questionSteps.length}
        aria-valuenow={position + 1}
      >
        <span
          style={{ width: `${((position + 1) / questionSteps.length) * 100}%` }}
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
          {stage.id === "review" && <>
            {reviewIssues.length > 0 && <div className="review-missing" role="alert"><strong>A few details need attention</strong>{reviewIssues.map((issue) => <div key={issue.question}><p>{issue.message}</p><button type="button" onClick={() => { setReviewing(true); move(plannerQuestions.findIndex((question) => question.id === issue.question)); }}>Fix this answer</button></div>)}</div>}
            {(request.dietary.length > 0 || request.accessibility) && <p className="requirements-guidance">{requirementsGuidance(request)}</p>}
            <div className="review-answers">{reviewGroups.map((item) => <div className="review-answer" key={item.id}><div><small>{item.label}</small><p>{item.value}</p></div><button type="button" onClick={() => { setReviewing(true); move(plannerQuestions.findIndex((question) => question.id === item.id)); }}>Edit {item.label.toLowerCase()}</button></div>)}</div>
          </>}
          {stage.id === "city" && !selectedCity && (
            <>
              <div className="location-methods">
                <Button type="button" disabled={locating || pending !== null} onClick={detectLocation}>{locating ? resolvingArea ? "Finding your area…" : "Getting your location…" : "Use My Location"}</Button>
                <span>or</span>
                <button type="button" className="location-manual-toggle" aria-expanded={manualLocation} aria-controls="manual-location" onClick={() => editLocation(manualLocation ? "choose" : "manual")}>{manualLocation ? "Hide manual selection" : "Choose manually"}</button>
                {locationMessage && <p role="status">{locationMessage}</p>}
                {locationSettingsNeeded && <LocationPermissionHelp onRetry={detectLocation} disabled={locating || transitioning || loading} />}
              </div>
              {manualLocation && <div className="location-manual typeform-answer" id="manual-location">
                <ManualCityPicker country={request.country} city={currentCity} countryHint={estimatedCountry && estimatedCountry === request.country ? "Estimated from your network. Change if needed." : undefined} onCountryChange={setOriginCountry} onCityChange={setOriginCity} onSelect={(city) => {
                  countryResolved.current = true;
                  const updated = { ...request, timeZoneConfirmed: false, currentCity: city, city, area: city, startingArea: "", locationScope: "city" as const, maxDistance: 30 };
                  setDetectedLocation(null); setDestinationChoice("city"); setRequest(updated); next(updated);
                }} />
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
                <Field label="Where would you love to go?"><input value={request.city} maxLength={80} autoComplete="off" onChange={(event) => setDestinationCity(event.target.value)} placeholder="Choose or type a destination city…" /></Field>
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
                <label className="field"><span>{request.budgetType === "per-person" ? "Budget per person" : request.guests === 2 ? "Total budget for both of you" : `Total budget for ${request.guests} people`}: {money(request.budget, request.currency)}</span><input className="budget-slider" type="range" min="0" max={request.currency === "NGN" ? 300000 : budgetOptions.at(-1)?.value ?? 250} step={request.currency === "NGN" ? 1000 : Math.max(1, budgetOptions[0].value / 25)} value={Math.min(request.budget, request.currency === "NGN" ? 300000 : budgetOptions.at(-1)?.value ?? 250)} onChange={(event) => update("budget", Number(event.target.value))} aria-label={request.budgetType === "per-person" ? "Budget per person" : `Total budget for ${request.guests} people`} /></label>
                <div className="budget-presets">{budgetOptions.map((option) => <button type="button" className={`filter-pill ${request.budget === option.value ? "active" : ""}`} aria-pressed={request.budget === option.value} key={option.value} onClick={() => update("budget", option.value)}>{option.label}</button>)}</div>
                <Field label="Budget currency"><select value={request.currency} onChange={(event) => setRequest((previous) => ({ ...previous, currency: event.target.value, budget: null, transportBudget: null }))}>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></Field>
                <Field label={`Or your own amount (${request.currency})`}>
                  <input type="number" min={0} max={10000000} step={10 ** -currencyDigits(request.currency)} value={request.budget ?? ""} onChange={(event) => update("budget", Number(event.target.value))} />
                </Field>
                <details className="flow-details">
                  <summary>What should the budget include?</summary>
                  <div className="form-stack">
                    {request.includeTransport && request.transport !== "Walking" && <Field label={`Optional transport allowance (${request.currency}, total)`} hint="Enter a quote or your own allowance. An unknown fare is kept separate from confirmed costs."><input type="number" min={0} max={10000000} step={10 ** -currencyDigits(request.currency)} value={request.transportBudget ?? ""} onChange={(event) => update("transportBudget", event.target.value === "" ? null : Number(event.target.value))} /></Field>}
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
                      Your total spending ceiling is {money(total, request.currency)}. Confirm estimated venue and transport costs before committing.
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
              <PreferenceTiles<PlanRequest["environment"]>
                label="Where would you prefer to spend your date?"
                name="environment"
                options={[{ value: "indoor", label: "Indoors" }, { value: "outdoor", label: "Outdoors" }, { value: "any", label: "Either works for us" }]}
                selected={request.environment}
                onChoose={value => update("environment", value)}
              />
              <PreferenceTiles
                label="Would you prefer somewhere quiet enough to talk?"
                name="quiet"
                options={[{ value: false, label: "No noise preference" }, { value: true, label: "Prioritise a quieter place" }]}
                selected={request.quiet}
                onChoose={value => update("quiet", value)}
              />
              <PreferenceTiles
                label="Is a step-free entrance essential for either of you?"
                name="accessibility"
                options={[{ value: false, label: "No step-free requirement" }, { value: true, label: "Step-free is essential" }]}
                selected={request.accessibility}
                onChoose={value => update("accessibility", value)}
              />
              <Field label="Which places or activities should we avoid?">
                <input value={request.dislikes} maxLength={500} onChange={(event) => update("dislikes", event.target.value)} placeholder="e.g. restaurants, cinemas or museums" />
              </Field>
              {request.dietary.length > 0 && <details className="flow-details">
                <summary>Previously saved food requirements</summary>
                <p>{request.dietary.join(", ")}</p>
                <button type="button" className="text-link" onClick={() => update("dietary", [])}>Remove saved food requirements</button>
              </details>}
              {(request.dietary.length > 0 || request.accessibility) && <p className="requirements-guidance" role="status">{requirementsGuidance(request)}</p>}
            </div>
          )}
          {stage.id === "date" && (
            <DatePicker key={request.timeZone} timeZone={request.timeZone} value={request.date} disabled={transitioning} onChange={(date) => { setRequest((previous) => ({ ...previous, date, datePreference: [0, 6].includes(calendarDay(date)) ? "weekend" : "weekday" })); setError(""); }} />
          )}
          {stage.id === "time" && <Field label="Choose your start time"><input type="time" required value={request.startTime} onChange={(event) => update("startTime", event.target.value)} /></Field>}

        </fieldset>
        {(error || serverError) && (
          <p className="error-message" role="alert">
            {error || serverError}
          </p>
        )}
        {(stage.id !== "city" || locationMode !== "choose") && <div className="typeform-confirm">
          <Button type="submit" disabled={transitioning || locating}>
            {stage.id === "city" && manualLocation ? "Use this city" : selectedCity ? "Continue" : step === plannerQuestionCount - 1 ? editingPlan ? "Find a new match" : "Reveal my date" : reviewing ? "Back to my details" : "Continue"}
          </Button>
          {selectedCity ? <Button type="button" variant="outline" disabled={pending !== null} onClick={() => editLocation("choose")}>Change</Button> : <span>
            press <strong>Enter</strong>
          </span>}
        </div>}
      </form>
      {editingPlan && stage.id === "review" && <ReviewScrollCue />}
    </main>
  );
}
