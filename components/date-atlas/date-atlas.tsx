"use client";
import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from "react";
import { z } from "zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  Heart,
  CalendarDays,
  UserRound,
  ArrowRight,
  X,
} from "lucide-react";
import { AccountPrivacy } from "./account-privacy";
import { AccountAccess } from "./account-access";
import { AuthScreen } from "./auth-screen";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { AnimatedFeedback } from "@/components/animations/feedback";
import { recommendationResultSchema } from "@/lib/planner/response-schema";
import { activeDiscoveryKey, invitationReturnKey, restoreDiscoverySession, rejectedPicksKey, readRejectedPicks, mergeRejectedPicks } from "@/lib/planner/discovery-session";
import { createdInvitationSchema, pendingInvitationKey } from "@/lib/planner/invitations";
import { RevokeInvitation } from "./revoke-invitation";
import { draftJSON, draftRequest, clearPlannerDrafts, draftIsCurrent, draftLifetimeMs } from "@/lib/planner/draft-retention";
import { requestGeneration } from "@/lib/planner/generation-client";
import { Homepage } from "./homepage";
import { Explore, ExperienceCard } from "./explore";
import { ExperiencePage } from "./experience-page";
import { Dashboard, ProfilePreferences } from "./dashboard";
import { preferenceSchema } from "@/lib/planner/preferences-storage";
import { chatSessionSchema, emptyChatSession, answeredThroughStep, intakeFields, intakeNextField, stepForIntake, type PlannerMode } from "@/lib/planner/intake";
import { PlannerModeChoice, PlannerModeSwitch } from "./planner-mode-choice";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import plannerStyles from "./planner-appearance.module.css";
import {
  requestSchema,
  experienceSchema,
  type Experience,
  type DatePlan,
  type GenerateInput,
  type PlanRequest,
  type RecommendationResult,
} from "@/lib/planner/schema";
import {
  decodeShare,
  parseSaved,
  savedAccountKey,
  pendingSaveKey,
  readPendingPlanAction,
  toRecipe,
  type SavedRecipe,
} from "@/lib/planner/saved";
import { onIdTokenChanged, signOut } from "firebase/auth";
import {
  getBrowserAuth,
  getAuthToken,
  hasEmailSignInLink,
  storedSignInEmail,
  completeEmailSignIn,
  authErrorMessage,
} from "@/lib/firebase/client";
import {
  plannerDraftVersion,
  plannerQuestions,
  restorePlannerStep,
} from "@/lib/planner/questions";

const PlannerWizard = dynamic(() =>
  import("./planner-wizard").then((module) => module.PlannerWizard),
);
const PlannerChat = dynamic(() => import("./planner-chat").then((module) => module.PlannerChat));
const Results = dynamic(() =>
  import("./results").then((module) => module.Results),
);
import { PlanningRequestError } from "@/lib/firebase/planner-client";
import { funnelScope, trackFunnel } from "@/lib/planner/funnel-client";

const draftKey = `date-atlas:planning-draft:v${plannerDraftVersion}`;
const activePlanKey = "date-atlas:active-plan:v1";
const favoritesKey = "date-atlas:favorites:v1";
const preferencesKey = "date-atlas:preferences:v1";
const appearanceKey = "date-atlas:planner-appearance:v1";
type PlannerAppearance = "white" | "red" | "dark";
type View =
  | "home"
  | "planner"
  | "results"
  | "saved"
  | "explore"
  | "favorites"
  | "profile"
  | "experience";
const defaultRequest = () =>
  requestSchema.parse({
    city: "Lagos",
    area: "Lagos",
    locationScope: "city",
    maxDistance: 30,
    occasion: "Romantic date",
    budget: null,
    vibes: ["Romantic"],
    datePreference: "weekend",
    date: "",
    startTime: "",
    duration: 300,
    interests: "",
    quiet: false,
  });

export function DateAtlas({
  initialView = "home",
  experienceId,
}: {
  initialView?: Exclude<View, "results">;
  experienceId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [catalog, setCatalog] = useState<Experience[]>([]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [infoPage, setInfoPage] = useState("");
  const [preferredIds, setPreferredIds] = useState<string[]>([]);
  const [compactHeader, setCompactHeader] = useState(false);
  const [request, setRequest] = useState<PlanRequest>(defaultRequest);
  const restoredDiscovery = useRef(false);
  const rejectionMemory = useRef({ flow: "", picks: mergeRejectedPicks() });
  const [plannerStep, setPlannerStep] = useState(0);
  const [editingPlan, setEditingPlan] = useState(false);
  const [plannerMode, setPlannerMode] = useState<PlannerMode | null>(null);
  const [chatSession, setChatSession] = useState(emptyChatSession);
  const [draftReady, setDraftReady] = useState(initialView !== "planner");
  const [plannerAppearance, setPlannerAppearance] = useState<PlannerAppearance>("red");
  const [exitOpen, setExitOpen] = useState(false);
  const [exitError, setExitError] = useState("");
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [toastRevision, setToastRevision] = useState(0);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authAccountView, setAuthAccountView] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSelection, setShareSelection] = useState<{ id: string; token: string } | null>(null);
  const [shareError, setShareError] = useState("");
  const [loadingStage, setLoadingStage] = useState("Checking your preferences");
  const [feedbackState, setFeedbackState] = useState<"success" | "error" | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const generationId = useRef(0);
  const activeGeneration = useRef("");
  const generationAttempt = useRef<{ body: string; key: string } | null>(null);
  const pendingSave = useRef<{ recipe: SavedRecipe; action: "save" | "share" } | null>(null);
  const shareController = useRef<AbortController | null>(null);
  const shareOwner = useRef<string | null>(null);
  const mounted = useRef(false);
  const savingPlans = useRef(new Set<string>());
  const savedRevision = useRef(0);
  const resumeSaveAfterAuth = useEffectEvent(() => { void resumeAfterAuth(); });
  const restoreShared = useEffectEvent((recipe: SavedRecipe) => {
    void restore(recipe);
  });
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const catalogController = new AbortController();
    if (initialView !== "home")
      fetch("/api/catalog", { signal: catalogController.signal })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Experiences could not be loaded.");
          return experienceSchema.array().parse(data.experiences);
        })
        .then((items) => {
          if (active) setCatalog(items);
        })
        .catch((failure) => {
          if (active && !catalogController.signal.aborted)
            setToast(
              failure instanceof Error
                ? failure.message
                : "Experiences could not be loaded.",
            );
        })
        .finally(() => {
          if (active) setCatalogLoading(false);
        });
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const appearance = localStorage.getItem(appearanceKey);
        if (appearance === "white" || appearance === "red" || appearance === "dark") setPlannerAppearance(appearance);
        const stored: unknown = JSON.parse(
          localStorage.getItem(favoritesKey) || "[]",
        );
        if (Array.isArray(stored))
          setFavorites(
            stored
              .filter((id): id is string => typeof id === "string")
              .slice(0, 100),
          );
        const prefs = preferenceSchema.safeParse(
          JSON.parse(localStorage.getItem(preferencesKey) || "{}"),
        );
        if (prefs.success)
          setRequest((previous) => ({ ...previous, ...prefs.data }));
      } catch {
        /* Default preferences remain available. */
      }
      setPreferencesReady(true);
    });
    function onScroll() {
      const scrollTop = window.scrollY;
      // Leave more room between thresholds than the header's 18px height change.
      setCompactHeader((compact) => scrollTop > (compact ? 16 : 64));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    if (initialView === "planner") {
      Promise.resolve().then(async () => {
        if (!active) return;
        try {
          const stored: unknown = JSON.parse(
            sessionStorage.getItem(activePlanKey) || "null",
          );
          const flow =
            new URLSearchParams(window.location.search).get("flow") ?? "direct";
          const rawDiscovery = sessionStorage.getItem(activeDiscoveryKey);
          const reference = z.object({ flow: z.string(), sessionId: z.uuid(), placeId: z.string(), expiresAt: z.number(), accepted: z.boolean().default(false) }).safeParse(JSON.parse(rawDiscovery ?? "null"));
          if (reference.success && reference.data.flow === flow && draftIsCurrent(reference.data)) {
            restoredDiscovery.current = true;
            await planningToken();
            const response = await plannerFetch("/api/plans/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reference.data), signal: AbortSignal.any([catalogController.signal, AbortSignal.timeout(30000)]) });
            const data = z.object({ request: requestSchema, result: recommendationResultSchema }).parse(await readPlanningResponse(response, () => {}));
            if (!active) return;
            setRequest(data.request); setResult(data.result); setView("results"); setDraftReady(true);
            if (reference.data.accepted) sessionStorage.setItem(`date-atlas:accepted-pick:${reference.data.sessionId}`, reference.data.placeId);
            return;
          }
          const discovery = restoreDiscoverySession(rawDiscovery, flow);
          if (discovery) {
            restoredDiscovery.current = true;
            setRequest(discovery.request); setResult(discovery.result); setView("results"); setDraftReady(true);
            sessionStorage.setItem(activeDiscoveryKey, JSON.stringify(discovery));
            if (discovery.accepted && discovery.result.nearby?.places[0]) sessionStorage.setItem(`date-atlas:accepted-pick:${discovery.result.nearby.sessionId ?? discovery.result.nearby.places[0].id}`, discovery.result.nearby.places[0].id);
            return;
          }
          if (
            flow &&
            stored &&
            typeof stored === "object" &&
            "flow" in stored &&
            stored.flow === flow &&
            draftIsCurrent(stored) &&
            "recipe" in stored
          ) {
            const recipe = parseSaved(JSON.stringify([stored.recipe]))[0];
            if (recipe) restoreShared(recipe);
          }
        } catch {
          if (active && restoredDiscovery.current) { setToast("Your earlier date could not be reopened. Your saved dates remain in your account."); setDraftReady(true); }
          /* A new plan remains available when a session recipe is invalid. */
        }
      });
      Promise.resolve()
        .then(
          () =>
            sessionStorage.getItem(draftKey) ||
            sessionStorage.getItem("date-atlas:planning-draft:v11") ||
            sessionStorage.getItem("date-atlas:planning-draft:v10") ||
            sessionStorage.getItem("date-atlas:planning-draft:v9") ||
            sessionStorage.getItem("date-atlas:planning-draft:v8") ||
            sessionStorage.getItem("date-atlas:planning-draft:v7") ||
            sessionStorage.getItem("date-atlas:planning-draft:v6") ||
            sessionStorage.getItem("date-atlas:planning-draft:v5") ||
            sessionStorage.getItem("date-atlas:planning-draft:v4") ||
            sessionStorage.getItem("date-atlas:planning-draft:v3") ||
            sessionStorage.getItem("date-atlas:planning-draft:v2"),
        )
        .then((raw) => {
          if (!active || !raw || restoredDiscovery.current) return;
          const draft: unknown = JSON.parse(raw);
          if (!draftIsCurrent(draft)) { clearPlannerDrafts(sessionStorage, plannerDraftVersion); setToast("Your earlier draft expired. Let's start fresh."); return; }
          if (draft && typeof draft === "object" && "request" in draft) {
            const parsed = requestSchema.safeParse(draft.request);
            if (parsed.success) {
              setRequest(parsed.data);
              if ("needsPreferenceReview" in draft && draft.needsPreferenceReview === true) setToast("Your core answers are restored. Personal notes and chat messages stay out of browser drafts; please review your preferences.");
              setEditingPlan("editingPlan" in draft && draft.editingPlan === true);
              setPlannerMode("plannerMode" in draft && (draft.plannerMode === "chat" || draft.plannerMode === "steps" || draft.plannerMode === null) ? draft.plannerMode : "steps");
              if ("chatSession" in draft) {
                const chat = chatSessionSchema.safeParse(draft.chatSession);
                if (chat.success) setChatSession(chat.data);
              }
              setPlannerStep(
                restorePlannerStep(
                  "needsPreferenceReview" in draft && draft.needsPreferenceReview === true ? Math.min("step" in draft && typeof draft.step === "number" ? draft.step : 0, plannerQuestions.findIndex((item) => item.id === "interests")) : "step" in draft ? draft.step : 0,
                  "version" in draft ? draft.version : undefined,
                ),
              );
              if ("preferredIds" in draft && Array.isArray(draft.preferredIds))
                setPreferredIds(
                  draft.preferredIds
                    .filter((id): id is string => typeof id === "string")
                    .slice(0, 4),
                );
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setDraftReady(true);
        });
    }
    const auth = getBrowserAuth();
    let sessionRevision = 0;
    const unsubscribe = auth
      ? onIdTokenChanged(auth, (user) => {
          if (!active) return;
          const revision = ++sessionRevision;
          const saveRevision = ++savedRevision.current;
          if (shareOwner.current && shareOwner.current !== user?.uid) {
            shareController.current?.abort(); shareController.current = null; shareOwner.current = null;
            setShareOpen(false); setShareSelection(null);
          }
          setSignedIn(!!user && !user.isAnonymous);
          setAccountId(user?.uid ?? "");
          try {
            setSaved(user && !user.isAnonymous ? parseSaved(localStorage.getItem(savedAccountKey(user.uid))) : []);
          } catch {
            setSaved([]);
          }
          if (user && !user.isAnonymous)
            user
              .getIdToken()
              .then((token) =>
                fetch("/api/saved-plans", {
                  headers: { Authorization: `Bearer ${token}` },
                }),
              )
              .then(async (response) => {
                if (!response.ok)
                  throw new Error("Cloud plans couldn't be loaded.");
                const data = await response.json();
                if (active && revision === sessionRevision && saveRevision === savedRevision.current) {
                  const plans = parseSaved(JSON.stringify(data.plans));
                  setSaved(plans);
                  try { localStorage.setItem(savedAccountKey(user.uid), JSON.stringify(plans)); } catch { /* Cloud plans remain available without a device cache. */ }
                }
              })
              .catch(() => {
                if (active && revision === sessionRevision)
                  setToast(
                    "Your account plans couldn't be refreshed. Check your connection and try again.",
                  );
              });
        })
      : undefined;
    void Promise.resolve().then(async () => {
      if (!active || !hasEmailSignInLink()) return;
      const email = storedSignInEmail();
      setAuthAccountView(false); setAuthOpen(true);
      if (!email) {
        setAuthMessage(
          "Enter the email that received this link to finish signing in.",
        );
        return;
      }
      setAuthBusy(true);
      try {
        await completeEmailSignIn(email);
        if (active) {
          setAuthOpen(false);
          setHistoryRevision((value) => value + 1);
          trackFunnel("authentication_completed");
          resumeSaveAfterAuth();
          setToast("You're signed in. Your plans have a home.");
        }
      } catch (failure) {
        if (active) setAuthMessage(authErrorMessage(failure));
      } finally {
        if (active) setAuthBusy(false);
      }
    });
    const shared = new URLSearchParams(window.location.search).get("plan");
    if (shared) {
      const recipe = decodeShare(shared);
      if (recipe) restoreShared(recipe);
      else
        Promise.resolve().then(() => {
          if (active)
            setToast(
              "That share link is invalid. You can create a fresh date plan.",
            );
        });
    }
    function syncStorage(event: StorageEvent) {
      const user = getBrowserAuth()?.currentUser;
      if (user && !user.isAnonymous && event.key === savedAccountKey(user.uid)) setSaved(parseSaved(event.newValue));
    }
    window.addEventListener("storage", syncStorage);
    return () => {
      active = false;
      mounted.current = false;
      catalogController.abort();
      window.removeEventListener("scroll", onScroll);
      abortRef.current?.abort();
      shareController.current?.abort();
      unsubscribe?.();
      window.removeEventListener("storage", syncStorage);
    };
  }, [initialView]);
  useEffect(() => {
    if (view !== "planner" || !draftReady) return;
    try {
      sessionStorage.setItem(
        draftKey,
        draftJSON({
          version: plannerDraftVersion,
          expiresAt: Date.now() + draftLifetimeMs,
          request,
          step: plannerStep,
          preferredIds,
          editingPlan,
          plannerMode,
          chatSession,
        }),
      );
      for (let version = 2; version < plannerDraftVersion; version++) sessionStorage.removeItem(`date-atlas:planning-draft:v${version}`);
    } catch {
      /* The current session still works when storage is unavailable. */
    }
  }, [request, plannerStep, view, draftReady, preferredIds, editingPlan, plannerMode, chatSession]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(""); setFeedbackState(null); }, 6000);
    return () => clearTimeout(timer);
  }, [toast, toastRevision]);
  function changePlannerAppearance(appearance: PlannerAppearance) {
    setPlannerAppearance(appearance);
    try { localStorage.setItem(appearanceKey, appearance); }
    catch { /* The selected appearance remains available for this visit. */ }
  }
  function saveAndExit(event: MouseEvent<HTMLButtonElement>) {
    try {
      sessionStorage.setItem(draftKey, draftJSON({ version: plannerDraftVersion, expiresAt: Date.now() + draftLifetimeMs, request, step: plannerStep, preferredIds, editingPlan, plannerMode, chatSession }));
    } catch {
      event.preventDefault();
      setExitError("We couldn't save your answers. Keep this tab open and try again.");
      return;
    }
    abortRef.current?.abort();
    setExitOpen(false);
    router.push("/");
  }
  function planDate(patch?: Partial<PlanRequest>, preferred?: string) {
    if (patch || preferred) {
      try {
        sessionStorage.setItem(
          draftKey,
          draftJSON({
            version: plannerDraftVersion,
            expiresAt: Date.now() + draftLifetimeMs,
            request: { ...request, ...patch },
            step: 0,
            preferredIds: preferred ? [preferred] : [],
            plannerMode: null,
          }),
        );
      } catch {
        setToast(
          "Your browser couldn't keep these selections. You can enter them in the planner.",
        );
      }
    }
    router.push(`/plan?flow=${crypto.randomUUID()}`);
  }
  function resetPlanner() {
    try {
      clearPlannerDrafts(sessionStorage, plannerDraftVersion);
      for (const key of [activePlanKey, activeDiscoveryKey, pendingSaveKey, rejectedPicksKey(new URLSearchParams(window.location.search).get("flow") ?? "direct")]) sessionStorage.removeItem(key);
      localStorage.removeItem(invitationReturnKey); localStorage.removeItem(pendingInvitationKey);
    } catch { setExitError("Your browser couldn't clear the draft. Please try again before starting over."); return; }
    pendingSave.current = null; rejectionMemory.current = { flow: "", picks: mergeRejectedPicks() };
    setRequest(defaultRequest()); setPlannerStep(0); setEditingPlan(false); setPlannerMode(null); setChatSession(emptyChatSession()); setPreferredIds([]); setResult(null); setError(""); setExitOpen(false);
  }
  function explore() {
    router.push("/explore");
  }
  function favorite(experience: Experience) {
    const next = favorites.includes(experience.id)
      ? favorites.filter((id) => id !== experience.id)
      : [...favorites, experience.id].slice(-100);
    try {
      localStorage.setItem(favoritesKey, JSON.stringify(next));
      setFavorites(next);
    } catch {
      setToast("Your browser couldn't save this favorite.");
    }
  }
  function showExperience(experience: Experience) {
    router.push(`/experiences/${encodeURIComponent(experience.id)}`);
  }
  function addExperience(experience: Experience) {
    planDate(
      {
        city: experience.city,
        country: experience.country,
        area: experience.area,
        vibes: experience.vibes.filter(
          (vibe): vibe is PlanRequest["vibes"][number] =>
            requestSchema.shape.vibes.element.safeParse(vibe).success,
        ),
      },
      experience.id,
    );
  }
  function customize() {
    const step = plannerQuestions.findIndex((question) => question.id === "review");
    setError("");
    setEditingPlan(true);
    setPlannerMode("steps");
    try {
      sessionStorage.removeItem(activePlanKey);
      sessionStorage.removeItem(activeDiscoveryKey);
    } catch {
      /* The current session remains usable. */
    }
    if (initialView === "planner") {
      setPlannerStep(step);
      setView("planner");
    } else {
      try {
        sessionStorage.setItem(
          draftKey,
          draftJSON({
            version: plannerDraftVersion,
            request,
            step,
            preferredIds,
            editingPlan: true,
            plannerMode: "steps",
            chatSession,
          }),
        );
      } catch {
        /* Answers remain available in the current itinerary. */
      }
      planDate();
    }
  }
  function choosePlannerMode(mode: PlannerMode) {
    if (mode === "chat" && !requestSchema.safeParse(request).success) { setError("Please finish this answer before switching to chat. Your other preferences are kept."); return; }
    const answered = [...new Set([...chatSession.answered, ...(plannerMode === "steps" ? answeredThroughStep(plannerStep) : []), ...(editingPlan ? intakeFields : [])])];
    const nextField = intakeNextField(request, answered);
    setChatSession((previous) => ({ ...previous, answered, nextField }));
    if (mode === "steps" && plannerMode === "chat") setPlannerStep(stepForIntake(nextField));
    trackFunnel("planner_started");
    setPlannerMode(mode);
    setError("");
    window.scrollTo({ top: 0 });
  }
  function changePlannerStep(step: number) {
    if (step > plannerStep) setChatSession((previous) => ({ ...previous, answered: [...new Set([...previous.answered, ...answeredThroughStep(step)])] }));
    setPlannerStep(step);
  }
  function cancelGeneration() {
    abortRef.current?.abort(); generationId.current++; activeGeneration.current = "";
    setBusy(false); setError("");
  }
  async function generate(
    preferences = request,
    extra: Partial<GenerateInput> = {},
  ) {
    const signature = JSON.stringify({ preferences, extra, preferredIds });
    if (activeGeneration.current === signature && abortRef.current && !abortRef.current.signal.aborted) return;
    activeGeneration.current = signature;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++generationId.current;
    setBusy(true);
    setError("");
    try {
      const flow = new URLSearchParams(window.location.search).get("flow") ?? "direct";
      let storedRejections = mergeRejectedPicks();
      try { storedRejections = readRejectedPicks(sessionStorage.getItem(rejectedPicksKey(flow))); } catch { /* Memory preserves exclusions when storage is unavailable. */ }
      const exclusions = mergeRejectedPicks(storedRejections, rejectionMemory.current.flow === flow ? rejectionMemory.current.picks : null, extra);
      rejectionMemory.current = { flow, picks: exclusions };
      try {
        sessionStorage.setItem(rejectedPicksKey(flow), JSON.stringify(exclusions));
        if (extra.excludeIds?.length || extra.excludePlaceIds?.length) {
          sessionStorage.setItem(draftKey, draftJSON({ version: plannerDraftVersion, expiresAt: Date.now() + draftLifetimeMs, request: preferences, step: plannerQuestions.length - 1, preferredIds, plannerMode, chatSession }));
          sessionStorage.removeItem(activeDiscoveryKey);
          sessionStorage.removeItem(activePlanKey);
        }
      } catch { /* The current request still uses the complete exclusion list. */ }
      setLoadingStage("Preserving your guest session");
      await planningToken();
      if (controller.signal.aborted) return;
      setLoadingStage("Preparing your recommendations");
      const body = JSON.stringify({ request: preferences, flowId: funnelScope(), preferredIds, ...extra, ...exclusions });
      const attempt = generationAttempt.current?.body === body ? generationAttempt.current : { body, key: crypto.randomUUID() };
      generationAttempt.current = attempt;
      const data = recommendationResultSchema.parse(await requestGeneration(body, attempt.key, controller.signal, (stage) => { if (!controller.signal.aborted) setLoadingStage(stage); }));
      if (controller.signal.aborted || id !== generationId.current) return;
      if ((extra.excludePlaceIds?.length || extra.excludeIds?.length) && !data.plans.length && !data.nearby?.places.length)
        throw new Error("No new place matched these preferences. Try changing the location, time or vibe.");
      setRequest(data.plans[0]?.request ?? preferences);
      setResult(data);
      setEditingPlan(false);
      generationAttempt.current = null;
      try {
        if (data.nearby?.places.length) sessionStorage.setItem(activeDiscoveryKey, JSON.stringify(data.nearby.sessionId ? { flow, sessionId: data.nearby.sessionId, placeId: data.nearby.places[0].id, expiresAt: Date.now() + 3600000, accepted: false } : { flow, request: draftRequest(preferences), result: data, expiresAt: Date.now() + 3600000, accepted: false }));
        else sessionStorage.removeItem(activeDiscoveryKey);
        sessionStorage.removeItem(draftKey);
        sessionStorage.removeItem("date-atlas:planning-draft:v11");
        sessionStorage.removeItem("date-atlas:planning-draft:v10");
        sessionStorage.removeItem("date-atlas:planning-draft:v9");
        sessionStorage.removeItem("date-atlas:planning-draft:v8");
        sessionStorage.removeItem("date-atlas:planning-draft:v7");
        sessionStorage.removeItem("date-atlas:planning-draft:v2");
        sessionStorage.removeItem("date-atlas:planning-draft:v3");
        sessionStorage.removeItem("date-atlas:planning-draft:v4");
        sessionStorage.removeItem("date-atlas:planning-draft:v5");
        sessionStorage.removeItem("date-atlas:planning-draft:v6");
      } catch {
        /* The generated plan does not depend on draft storage. */
      }
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) {
      if (failure instanceof PlanningRequestError && failure.status === 409) generationAttempt.current = null;
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error && failure.name === "TimeoutError" ? "Planning took too long. Your answers are kept; retry the same request." : failure instanceof Error ? failure.message : "Please try again.",
        );
    } finally {
      if (id === generationId.current) { activeGeneration.current = ""; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  async function restore(recipe: SavedRecipe) {
    const owner = getBrowserAuth()?.currentUser?.uid;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++generationId.current;
    setBusy(true);
    try {
      const response = await plannerFetch("/api/plans/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
        signal: controller.signal,
      });
      const data = recommendationResultSchema.parse(await readPlanningResponse(response, () => {}));
      if (controller.signal.aborted || id !== generationId.current || getBrowserAuth()?.currentUser?.uid !== owner) return;
      setRequest(data.plans?.[0]?.request ?? recipe.request);
      setResult(data);
      setView("results");
      window.scrollTo({ top: 0 });
    } catch (failure) {
      if (!controller.signal.aborted && getBrowserAuth()?.currentUser?.uid === owner)
        setToast(
          failure instanceof Error ? failure.message : "Please try again.",
        );
    } finally {
      if (!controller.signal.aborted && id === generationId.current)
        setBusy(false);
    }
  }
  function rememberPlan(plan: DatePlan) {
    if (initialView !== "planner") return;
    try {
      sessionStorage.setItem(
        activePlanKey,
        JSON.stringify({
          flow:
            new URLSearchParams(window.location.search).get("flow") ?? "direct",
          expiresAt: Date.now() + draftLifetimeMs,
          recipe: { ...toRecipe(plan), title: "Your chosen date", request: draftRequest(plan.request) },
        }),
      );
    } catch {
      /* Saving and sharing still work when session storage is unavailable. */
    }
  }
  async function savePlan(plan: DatePlan) {
    const recipe = toRecipe(plan);
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous) {
      rememberPlan(plan);
      pendingSave.current = { recipe, action: "save" };
      try { localStorage.setItem(pendingSaveKey, JSON.stringify({ recipe: { ...recipe, title: "Your chosen date", request: draftRequest(recipe.request) }, flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", expiresAt: Date.now() + 3600000 })); } catch { /* The current tab retains the action in memory. */ }
      openAuthentication();
      return;
    }
    await saveRecipe(recipe);
  }
  async function saveRecipe(recipe: SavedRecipe) {
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous) return;
    const operationKey = `${user.uid}:${recipe.id}`;
    if (savingPlans.current.has(operationKey)) return;
    savedRevision.current++;
    savingPlans.current.add(operationKey);
    pendingSave.current = null;
    try { sessionStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingSaveKey); } catch { /* The selected date remains in memory if saving needs a retry. */ }
    try {
      const token = await user.getIdToken();
      if (!mounted.current || getBrowserAuth()?.currentUser?.uid !== user.uid) return;
      const response = await fetch("/api/saved-plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(recipe),
      });
      if (!response.ok) throw new Error("Your plan couldn't be saved. Please try again.");
      if (!mounted.current || getBrowserAuth()?.currentUser?.uid !== user.uid) return;
      setSaved((previous) => [recipe, ...previous.filter((item) => item.id !== recipe.id)].slice(0, 100));
      try {
        const next = [recipe, ...parseSaved(localStorage.getItem(savedAccountKey(user.uid))).filter((item) => item.id !== recipe.id)].slice(0, 100);
        localStorage.setItem(savedAccountKey(user.uid), JSON.stringify(next));
        sessionStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingSaveKey);
      } catch { /* Saving to the account succeeded even without a device cache. */ }
      pendingSave.current = null;
      setFeedbackState("success"); setToast("Saved to your account.");
    } catch {
      if (mounted.current && getBrowserAuth()?.currentUser?.uid === user.uid) setToast("Your plan couldn't be saved. Please try again. Your current date is still here.");
    } finally { savingPlans.current.delete(operationKey); }
  }
  async function resumeAfterAuth() {
    const owner = getBrowserAuth()?.currentUser;
    if (!owner || owner.isAnonymous) return;
    const stillCurrent = () => mounted.current && getBrowserAuth()?.currentUser?.uid === owner.uid;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(invitationReturnKey) ?? "null");
      const context = z.object({ flow: z.string(), sessionId: z.uuid(), placeId: z.string(), expiresAt: z.number() }).safeParse(raw);
      if (context.success && context.data.flow === (new URLSearchParams(window.location.search).get("flow") ?? "direct") && context.data.expiresAt > Date.now() && context.data.expiresAt <= Date.now() + 3600000) {
        const response = await plannerFetch("/api/plans/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context.data), signal: AbortSignal.timeout(30000) });
        const data = z.object({ request: requestSchema, result: recommendationResultSchema }).parse(await readPlanningResponse(response, () => {}));
        if (!stillCurrent()) return;
        sessionStorage.setItem(`date-atlas:accepted-pick:${context.data.sessionId}`, context.data.placeId);
        setRequest(data.request); setResult(data.result); setView("results");
        localStorage.removeItem(invitationReturnKey);
      }
      if (stillCurrent()) await resumePendingSave();
    } catch (failure) { if (stillCurrent()) setToast(failure instanceof Error ? failure.message : "Sign-in succeeded. Reopen your chosen date to finish."); }
  }
  async function resumePendingSave() {
    const owner = getBrowserAuth()?.currentUser;
    if (!owner || owner.isAnonymous) return;
    let action = pendingSave.current;
    try { action ??= readPendingPlanAction((sessionStorage.getItem(pendingSaveKey) ?? localStorage.getItem(pendingSaveKey)), Date.now(), new URLSearchParams(window.location.search).get("flow") ?? "direct"); } catch { /* Use the in-memory pending action. */ }
    if (action) {
      const response = await plannerFetch("/api/plans/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action.recipe), signal: AbortSignal.timeout(30000) });
      const restored = recommendationResultSchema.parse(await readPlanningResponse(response, () => {}));
      if (!mounted.current || getBrowserAuth()?.currentUser?.uid !== owner.uid) return;
      const plan = restored.plans[0];
      if (!plan) throw new Error("Your date needs a quick review before saving or sharing.");
      action = { ...action, recipe: toRecipe(plan) };
      try { sessionStorage.setItem("date-atlas:accepted-catalog:v1", plan.id); } catch { /* The pending action still resumes. */ }
      setRequest(plan.request); setResult(restored); setView("results");
      if (action.action === "share") await shareRecipe(action.recipe);
      else await saveRecipe(action.recipe);
    }
    else {
      try { sessionStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingSaveKey); } catch { /* No pending action remains. */ }
    }
  }
  async function refreshSavedPlans() {
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous) return;
    const revision = ++savedRevision.current;
    try {
      const response = await plannerFetch("/api/saved-plans", { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const data = await readPlanningResponse(response, () => {});
      const plans = parseSaved(JSON.stringify(data && typeof data === "object" && "plans" in data ? data.plans : []));
      if (!mounted.current || getBrowserAuth()?.currentUser?.uid !== user.uid || revision !== savedRevision.current) return;
      setSaved(plans);
      try { localStorage.setItem(savedAccountKey(user.uid), JSON.stringify(plans)); } catch { /* Cloud data remains authoritative. */ }
    } catch { if (mounted.current && getBrowserAuth()?.currentUser?.uid === user.uid) setToast("Your date changed. Refresh My dates if the saved-plan list looks out of date."); }
  }
  async function removeSaved(id: string) {
    savedRevision.current++;
    const token = await getAuthToken().catch(() => null);
    if (signedIn && !token) {
      setToast("Couldn't connect to your account. Please try removing the plan again.");
      return;
    }
    if (token) {
      try {
        const response = await fetch("/api/saved-plans", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id }),
        });
        if (!response.ok) throw new Error();
      } catch {
        setToast(
          "Couldn't remove this plan from your account. Please try again.",
        );
        return;
      }
    }
    const next = saved.filter((item) => item.id !== id);
    try {
      const user = getBrowserAuth()?.currentUser;
      if (user && !user.isAnonymous) localStorage.setItem(savedAccountKey(user.uid), JSON.stringify(next));
      setSaved(next);
      setToast("Plan removed from your saved collection.");
    } catch {
      setToast("Your browser couldn't update saved plans.");
    }
  }
  async function sharePlan(plan: DatePlan) {
    if (plan.demo) { setToast("This demonstration uses fictional venues. Real invitations are available for approved real experiences."); return; }
    const recipe = toRecipe(plan);
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous) {
      rememberPlan(plan);
      pendingSave.current = { recipe, action: "share" };
      try { localStorage.setItem(pendingSaveKey, JSON.stringify({ recipe: { ...recipe, title: "Your chosen date", request: draftRequest(recipe.request) }, action: "share", flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", expiresAt: Date.now() + 3600000 })); } catch { /* The current tab retains the action in memory. */ }
      openAuthentication();
      return;
    }
    await shareRecipe(recipe);
  }
  async function shareRecipe(recipe: SavedRecipe) {
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous || shareController.current) return;
    const controller = new AbortController(); shareController.current = controller;
    shareOwner.current = user.uid;
    pendingSave.current = null;
    try { sessionStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingSaveKey); } catch { /* The plan remains available for a retry. */ }
    setShareOpen(true); setShareSelection(null); setShareError("");
    try {
      const response = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "catalog", recipe }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      const selection = createdInvitationSchema.parse(await readPlanningResponse(response, () => {}));
      if (!controller.signal.aborted && mounted.current && getBrowserAuth()?.currentUser?.uid === user.uid) setShareSelection(selection);
    } catch (failure) { if (!controller.signal.aborted && mounted.current && getBrowserAuth()?.currentUser?.uid === user.uid) setShareError(failure instanceof Error ? failure.message : "Your invitation couldn't be created. Your plan is still here; try again."); }
    finally { if (shareController.current === controller) shareController.current = null; }
  }
  async function sendCatalogInvitation(copy = false) {
    if (!shareSelection) return;
    const url = `${window.location.origin}/invite/${shareSelection.token}`;
    try {
      if (!copy && navigator.share) await navigator.share({ title: "A date, just us two.", text: "I've planned a little something for us. Will you come?", url });
      else { await navigator.clipboard.writeText(url); setToast("Invitation link copied. Send it to your date."); }
    } catch (failure) { if (!(failure instanceof Error && failure.name === "AbortError")) setShareError("Sharing didn't open. Try copying the link or sending it on WhatsApp."); }
  }
  function openAuthentication() {
    const user = getBrowserAuth()?.currentUser;
    setAuthAccountView(!!user && !user.isAnonymous);
    setAuthOpen(true);
  }
  const planning = view === "planner";
  return (
      <div
        className={`atlas-app ${planning ? `is-planning ${plannerStyles.palette} ${plannerStyles.planner}` : ""} ${view === "home" ? "is-lover-intro" : ""} ${signedIn && !planning ? "has-mobile-nav" : ""} ${view === "results" ? "has-itinerary" : ""}`}
        data-planner-theme={planning ? plannerAppearance : undefined}
      >
        <header className={`atlas-header ${compactHeader ? "compact" : ""}`}>
          <Link
            className="atlas-wordmark"
            href="/"
            aria-label="a date at las home"
            title="adal — a date at las"
          >
            adal<span>.</span>
          </Link>
          {planning ? (
            <div className={plannerStyles.controls}>
              <div className={plannerStyles.switch} role="group" aria-label="Planner appearance">
                {(["white", "red", "dark"] as const).map((appearance) => <button type="button" key={appearance} aria-pressed={plannerAppearance === appearance} onClick={() => changePlannerAppearance(appearance)}>{appearance === "white" ? "White" : appearance === "red" ? "Red" : "Dark"}</button>)}
              </div>
              <AlertDialog open={exitOpen} onOpenChange={(open) => { setExitOpen(open); if (open) setExitError(""); }}>
                <AlertDialogTrigger asChild>
                  <button type="button" className={plannerStyles.close} aria-label="Close planner" disabled={!draftReady}><X size={20} aria-hidden="true" /></button>
                </AlertDialogTrigger>
                <AlertDialogContent className={`${plannerStyles.palette} ${plannerStyles.exitDialog}`} data-planner-theme={plannerAppearance}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave the planner?</AlertDialogTitle>
                    <AlertDialogDescription>Keep core answers for one hour in this tab, or clear the draft. Personal notes and chat messages are not stored; review them when you return.</AlertDialogDescription>
                  </AlertDialogHeader>
                  {exitError && <p role="alert" className={plannerStyles.saveError}>{exitError}</p>}
                  <button type="button" className={plannerStyles.clearDraft} onClick={resetPlanner}>Clear answers and start again</button>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={saveAndExit}>Save &amp; exit</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : view === "home" ? (
            <div className="header-actions">
              {signedIn && <Link href="/saved">My dates</Link>}
              <button onClick={() => signedIn ? router.push("/profile") : openAuthentication()}>{signedIn ? "My account" : "Sign in"}</button>
            </div>
          ) : (
            <>
              <nav className="desktop-nav" aria-label="Main navigation">
                <Link href="/explore">Explore</Link>
                <Link href="/#how-it-works">How it works</Link>
                <Link href="/#date-ideas">Date ideas</Link>
                <button onClick={() => planDate()}>Plan a date</button>
              </nav>
              <div className="header-actions">
                <button
                  onClick={() =>
                    signedIn ? router.push("/profile") : openAuthentication()
                  }
                >
                  {signedIn ? "My account" : "Sign in"}
                </button>
                <Button size="small" onClick={() => planDate()}>
                  Plan My Date
                  <ArrowRight size={14} />
                </Button>
              </div>
            </>
          )}
        </header>
        {view === "home" && <Homepage onPlan={() => planDate()} />}
        {view === "explore" && (
          <Explore
            onBack={() => router.push("/")}
            onPlan={(experience) =>
              experience ? addExperience(experience) : planDate()
            }
            onSelect={showExperience}
            favorites={favorites}
            onFavorite={favorite}
          />
        )}
        {view === "favorites" && (
          <main className="page-container favorites-page">
            <div className="results-heading">
              <div>
                <span className="eyebrow">KEEP A LITTLE INSPIRATION</span>
                <h1>Your kind of lovely.</h1>
                <p>Experiences you&apos;ve saved on this device.</p>
              </div>
              <Button variant="outline" onClick={() => explore()}>
                Explore experiences
              </Button>
            </div>
            {catalogLoading ? (
              <p role="status">Loading your favorites…</p>
            ) : (
              <div className="experience-grid">
                {catalog
                  .filter((item) => favorites.includes(item.id))
                  .map((item) => (
                    <ExperienceCard
                      key={item.id}
                      experience={item}
                      onSelect={showExperience}
                      favorite
                      onFavorite={favorite}
                      onAdd={addExperience}
                    />
                  ))}
              </div>
            )}
            {!catalogLoading && !favorites.length && (
              <div className="empty-state">
                <Heart size={32} />
                <h2>A collection of possibilities.</h2>
                <p>
                  Save an experience that catches your eye. It will be waiting
                  here.
                </p>
                <Button onClick={() => explore()}>Find your inspiration</Button>
              </div>
            )}
          </main>
        )}
        {view === "profile" && preferencesReady && (
          <ProfilePreferences
            request={request}
            signedIn={signedIn}
            onAuth={openAuthentication}
            onSave={(preferences) => {
              try {
                localStorage.setItem(
                  preferencesKey,
                  JSON.stringify(preferences),
                );
                setRequest((previous) => ({ ...previous, ...preferences }));
                setToast(
                  "Preferences saved on this device. They'll shape your next plan.",
                );
              } catch {
                setToast("Your browser couldn't save your preferences.");
              }
            }}
            onReset={() => {
              try {
                localStorage.removeItem(preferencesKey);
                setRequest(defaultRequest());
                setToast("Saved preferences cleared.");
              } catch {
                setToast("Your browser couldn't clear preferences.");
              }
            }}
          />
        )}
        {planning && !busy && preferredIds.length > 0 && (
          <div className="planner-included content-width">
            <span className="mini-label">ADDED TO YOUR DATE</span>
            {preferredIds.map((id) => (
              <div key={id}>
                <strong>
                  {catalog.find((item) => item.id === id)?.name ||
                    "Your selected experience"}
                </strong>
                <button
                  onClick={() =>
                    setPreferredIds((previous) =>
                      previous.filter((item) => item !== id),
                    )
                  }
                  aria-label="Remove selected experience"
                >
                  Remove
                </button>
              </div>
            ))}
            <small>
              We&apos;ll include this experience if it fits all your
              requirements.
            </small>
          </div>
        )}
        {planning && draftReady && plannerMode !== null && !busy && <PlannerModeSwitch mode={plannerMode} onChange={choosePlannerMode} disabled={busy} />}
        {planning && (!draftReady || plannerMode === null && busy) && <main className="planning-loader"><p>{busy ? "Opening your date plan…" : "Getting your questions ready…"}</p></main>}
        {planning && draftReady && plannerMode === null && !busy && <PlannerModeChoice onChoose={choosePlannerMode} />}
        {planning && draftReady && plannerMode === "chat" && <PlannerChat onCancelGeneration={cancelGeneration} request={request} setRequest={setRequest} session={chatSession} setSession={setChatSession} onGenerate={() => generate()} loading={busy} loadingStage={loadingStage} serverError={error} />}
        {planning && draftReady && plannerMode === "steps" && (
            <PlannerWizard
              request={request}
              setRequest={setRequest}
              step={plannerStep}
              editingPlan={editingPlan}
              theme={plannerAppearance}
              setStep={changePlannerStep}
              onCancelGeneration={cancelGeneration}
            onGenerate={() => generate()}
              onLocationDetected={({ area, city }) => {
                setFeedbackState(null);
                setToast(`Location found: ${area}, ${city}.`);
                setToastRevision((revision) => revision + 1);
              }}
              loading={busy}
              serverError={error}
              loadingStage={loadingStage}
            />
          )}
        {view === "results" && result && (
          <Results
            result={result}
            planningRequest={request}
            signedIn={signedIn && !authOpen}
            accountRevision={`${accountId}:${historyRevision}`}
            onSignIn={openAuthentication}
            onActivePlan={rememberPlan}
            setResult={(next) => {
              setResult(next);
              if (next.plans.length) setRequest(next.plans[0].request);
            }}
            onCustomize={() => customize()}
            onChangeTiming={() => customize()}
            onBack={() => router.push("/")}
            onSave={(plan) => void savePlan(plan)}
            onShare={(plan) => void sharePlan(plan)}
            onCancelGeneration={cancelGeneration}
            onRegenerate={generate}
            busy={busy}
            requestError={error}
          />
        )}
        {view === "saved" && (
          <Dashboard
            onHistoryChanged={() => void refreshSavedPlans()}
            onLegacyImported={(recipe) => setSaved((previous) => [recipe, ...previous.filter((item) => item.id !== recipe.id)])}
            key={accountId}
            historyRevision={historyRevision}
            saved={saved}
            favorites={favorites}
            catalog={catalog}
            signedIn={signedIn}
            busy={busy}
            onPlan={() => planDate()}
            onOpen={(item) => void restore(item)}
            onRemove={(id) => void removeSaved(id)}
            onFavorites={() => router.push("/favorites")}
            onProfile={() => router.push("/profile")}
          />
        )}
        {view === "experience" && (
          <ExperiencePage
            experience={catalog.find((item) => item.id === experienceId)}
            catalog={catalog}
            loading={catalogLoading}
            favorite={favorites.includes(experienceId || "")}
            favorites={favorites}
            onFavorite={favorite}
            onAdd={addExperience}
            onSelect={showExperience}
          />
        )}
        {!planning && (
          <>
            {view !== "home" && <footer className="atlas-footer content-width">
              <div>
                <Link className="atlas-wordmark" href="/">
                  a date at las<span>.</span>
                </Link>
                <small>Starting in Lagos</small>
              </div>
              <div>
                <strong>Make a memory</strong>
                <Link
                  href="/plan"
                  onNavigate={(event) => {
                    event.preventDefault();
                    planDate();
                  }}
                >
                  Plan a date
                </Link>
                <Link href="/explore">Explore experiences</Link>
                <Link href="/saved">My dates</Link>
                <Link href="/favorites">Favorites</Link>
              </div>
              <div>
                <strong>A little about us</strong>
                {["About a date at las", "Partner with us", "Help & support"].map(
                  (page) => (
                    <button key={page} onClick={() => setInfoPage(page)}>
                      {page}
                    </button>
                  ),
                )}
              </div>
              <div>
                <strong>The details</strong>
                {["Privacy policy", "Terms"].map((page) => (
                  <button key={page} onClick={() => setInfoPage(page)}>
                    {page}
                  </button>
                ))}
                <Link href="/admin">Recommendation lab</Link>
              </div>
              <div className="footer-bottom">
                <span>© {new Date().getFullYear()} a date at las</span>
                <span>Thoughtful dates, wherever life takes you.</span>
              </div>
            </footer>}
            {signedIn && (
              <nav className="mobile-nav" aria-label="Mobile navigation">
                <Link
                  href="/explore"
                  aria-current={view === "explore" ? "page" : undefined}
                >
                  <Compass size={19} />
                  Explore
                </Link>
                <Link
                  href="/plan"
                  onNavigate={(event) => {
                    event.preventDefault();
                    planDate();
                  }}
                >
                  <Heart size={19} />
                  Plan
                </Link>
                <Link
                  href="/saved"
                  aria-current={view === "saved" ? "page" : undefined}
                >
                  <CalendarDays size={19} />
                  My dates
                </Link>
                <Link
                  href="/profile"
                  aria-current={view === "profile" ? "page" : undefined}
                >
                  <UserRound size={19} />
                  Profile
                </Link>
              </nav>
            )}
          </>
        )}
        <Dialog
          open={!!infoPage}
          onOpenChange={(open) => {
            if (!open) setInfoPage("");
          }}
          title={infoPage}
          className="info-dialog"
        >
          <span className="eyebrow">A DATE AT LAS</span>
          <h2>{infoPage}</h2>
          {infoPage === "Privacy policy" ? (
            <>
              <p>
                Your answers help shape your date. Core browser drafts expire
                after one hour. Saving plans and creating invitations require
                an account. Favorites and saved preferences stay on this device.
              </p>
              <p>
                When configured, DeepSeek receives planning preferences to
                personalize recommendations. Invitation links show the venue,
                date, time and a preview, and omit your private answers and
                account details. Anyone with a link can view and respond until
                you revoke it.
              </p>
              <p>
                Delete saved dates in My dates or request account deletion in
                Manage account. “Use My Location” asks for your permission and sends coordinates to Google to identify your neighborhood. Precise device coordinates are not saved. You can choose an area manually instead.
              </p>
              <Link href="/privacy">Read the full privacy policy</Link>
            </>
          ) : infoPage === "Terms" ? (
            <>
              <p>
                Fictional development records are labeled demo. Estimates are
                not confirmed prices, reservations,
                traffic reports, or availability guarantees.
              </p>
              <p>
                Check current details directly with a real provider before
                traveling or paying. a date at las does not collect booking payments.
              </p>
              <Link href="/terms">Read the full terms, including Google Maps terms</Link>
            </>
          ) : infoPage === "Partner with us" ? (
            <p>
              We&apos;re preparing our Lagos collection. Only approved, sourced
              venue records can be recommended in live mode. Vendor onboarding
              and direct payments are not open in this demonstration.
            </p>
          ) : infoPage === "Help & support" ? (
            <>
              <p>
                Start with Plan My Date, answer a few quick questions, then
                discover one thoughtfully selected date. Use Swap or your date assistant to
                refine the itinerary.
              </p>
              <p>
                No suitable plan? Try a different start time, area, or vibe.
                Your spending limit stays unchanged; unconfirmed venue costs
                still need checking. Sign in to reopen and edit a saved date in My dates.
              </p>
            </>
          ) : (
            <p>
              a date at las connects your interests, time, and budget into a
              thoughtful day together. We&apos;re starting in Lagos and preparing a
              carefully sourced catalog of local experiences.
            </p>
          )}
        </Dialog>
        <Dialog open={shareOpen && !authOpen && signedIn} onOpenChange={(open) => { setShareOpen(open); if (!open) { shareController.current?.abort(); shareController.current = null; } }} title="Your date invitation" description="Choose how to share your invitation.">
          <div className="form-stack">
            <h2>{shareSelection ? "Your invitation is ready." : shareError ? "A little detour." : "Preparing your invitation…"}</h2>
            <p>Anyone with this link can see the chosen venue, day, time and date story, and respond. Your budget, private preferences and account details stay private. You can revoke the link at any time.</p>
            {shareError && <p role="alert" className="error-message">{shareError}</p>}
            {shareSelection ? <>
              <Button onClick={() => void sendCatalogInvitation()}>Share with your date</Button>
              <Button variant="outline" onClick={() => void sendCatalogInvitation(true)}>Copy invitation link</Button>
              <a className="button button-outline" href={`https://wa.me/?text=${encodeURIComponent(`I've planned a little something for us. Will you come? ${window.location.origin}/invite/${shareSelection.token}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
              <RevokeInvitation id={shareSelection.id} onRevoked={() => { setShareOpen(false); setShareSelection(null); setToast("Invitation revoked. The old link no longer works."); }} />
            </> : !shareError && <p role="status">Keeping your date together.</p>}
          </div>
        </Dialog>
        <AuthScreen
          open={authOpen}
          onOpenChange={(open) => {
            setAuthOpen(open);
            if (!open) {
              pendingSave.current = null;
              try { sessionStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingInvitationKey); } catch { /* The current plan remains available. */ }
            }
          }}
          signedIn={signedIn && authAccountView}
        >
          {signedIn && authAccountView ? (
            <>
            <span className="eyebrow">YOUR NEXT CHAPTER</span>
            <h1>Good to have you here.</h1>
            <p>Your saved date plans are kept privately with your account.</p>
            <Button
              variant="outline"
              onClick={async () => {
                const auth = getBrowserAuth();
                if (!auth) return;
                try {
                  await signOut(auth);
                } catch {
                  setAuthMessage("We couldn't sign you out. Please try again.");
                  return;
                }
                setAuthOpen(false);
                setToast(
                  "You're logged out. Sign in to see your saved date plans.",
                );
              }}
            >
              Log out
            </Button>
            <AccountPrivacy />
            </>
          ) : (
            <AccountAccess onDone={() => { setAuthOpen(false); setHistoryRevision((value) => value + 1); setFeedbackState("success"); setToast("You're signed in. Your guest dates stay with you."); trackFunnel("authentication_completed"); void resumeAfterAuth(); }} />
          )}
          {authBusy && <p role="status">Completing your secure sign-in…</p>}
          {authMessage && (
            <p className="auth-message" role="status">
              {authMessage}
            </p>
          )}
        </AuthScreen>
        {toast && (
          <div key={toastRevision} className="toast" role="status" aria-atomic="true">
            {feedbackState && <AnimatedFeedback state={feedbackState} label="Action completed" />}
            <span>{toast}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              ×
            </button>
          </div>
        )}
      </div>
  );
}
