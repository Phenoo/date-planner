"use client";
import { Suspense, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { z } from "zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supportEmail, supportInbox } from "@/lib/seo/site";
import { useRouter } from "next/navigation";
import {
  Heart,
  CalendarDays,
  UserRound,
  Compass,
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
import { recommendationExclusions, replacementPreferredIds } from "@/lib/planner/recommendation-replacement";
import { createdInvitationSchema, pendingInvitationKey } from "@/lib/planner/invitations";
import { RevokeInvitation } from "./revoke-invitation";
import { draftJSON, draftRequest, clearPlannerDrafts, draftIsCurrent, draftMatchesFlow, draftLifetimeMs, plannerModeKey, savedPlannerMode } from "@/lib/planner/draft-retention";
import { requestGeneration } from "@/lib/planner/generation-client";
import { pendingDateReminderKey } from "@/lib/planner/date-reminder-intent";
import { applyPageSurface, readPlannerAppearance, savePlannerAppearance, type PlannerAppearance } from "@/lib/planner/page-surface";
import { activePlanKey, clearPlanningContinuations, continuationPath, readPlanningContinuation, retainPlanningContinuation } from "@/lib/planner/planning-continuation";
import { Homepage } from "./homepage";
import { PlannerLoadingScreen } from "./planner-loading-screen";
import { GeneratingScreen } from "./generating-screen";
import { PlaceDiscovery } from "./place-discovery";
import { currencyForCountry } from "@/lib/planner/currency";
import authenticatedStyles from "./authenticated-shell.module.css";
import { InvitationNote } from "./invitation-note";
import { Explore, ExperienceCard } from "./explore";
import { ExperiencePage } from "./experience-page";
import { Dashboard, ProfilePreferences } from "./dashboard";
import { LegacyPlans } from "./legacy-plans";
import { preferenceSchema } from "@/lib/planner/preferences-storage";
import { chatSessionSchema, emptyChatSession, intakeFields, intakeNextField, intakeFieldForQuestion, stepForIntake, type PlannerMode } from "@/lib/planner/intake";
import { PlannerModeChoice } from "./planner-mode-choice";
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
  readCatalogAuthReturn,
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
  waitForAccountTransition,
  hasPendingAccountTransfer,
  subscribeAccountTransfer,
} from "@/lib/firebase/client";
import {
  plannerDraftVersion,
  plannerQuestions,
  restorePlannerStep,
  type PlannerQuestionId,
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
const favoritesKey = "date-atlas:favorites:v1";
const preferencesKey = "date-atlas:preferences:v1";
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
    duration: 180,
    durationMode: "estimated",
    interests: "",
    quiet: false,
  });

function PlannerInitializing({ theme = "red", overlay = false }: { theme?: PlannerAppearance; overlay?: boolean }) {
  const stage = "Getting your planner ready and checking for recent answers…";
  return overlay ? <GeneratingScreen theme={theme} mode="opening" stage={stage} /> : <PlannerLoadingScreen theme={theme} stage={stage} />;
}

export function DateAtlas({
  initialView = "home",
  experienceId,
  initialCatalog,
}: {
  initialView?: Exclude<View, "results">;
  experienceId?: string;
  initialCatalog?: Experience[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [loadedCatalog, setCatalog] = useState<Experience[]>([]);
  const catalog = initialCatalog ?? loadedCatalog;
  const hasInitialCatalog = initialCatalog !== undefined;
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(initialCatalog === undefined);
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
  const authTransferPending = useSyncExternalStore(subscribeAccountTransfer, hasPendingAccountTransfer, () => false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSelection, setShareSelection] = useState<{ id: string; token: string; message?: string } | null>(null);
  const [invitationDirty, setInvitationDirty] = useState(false);
  const [shareError, setShareError] = useState("");
  const [loadingStage, setLoadingStage] = useState("Checking your preferences");
  const [feedbackState, setFeedbackState] = useState<"success" | "error" | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [accountProfile, setAccountProfile] = useState<{ name: string | null; email: string | null }>({ name: null, email: null });
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
  const previousAccount = useRef<{ uid: string; anonymous: boolean } | null>(null);
  const resumingAuth = useRef<Promise<void> | null>(null);
  const finishAuthentication = useEffectEvent(() => authenticationDone());
  const restoreShared = useEffectEvent((recipe: SavedRecipe) => restore(recipe));
  const clearUnrestoredResult = useEffectEvent(() => {
    if (result?.plans.length || result?.nearby?.places.length) { setResult(null); setView("planner"); }
  });
  useLayoutEffect(() => () => {
    // Activity preserves state on hide; old auth callbacks must not reopen the cached account UI.
    mounted.current = false;
    setAuthReady(false);
    setResumePath(null);
    if (initialView === "planner") setDraftReady(false);
  }, [initialView]);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const catalogController = new AbortController();
    const flow = new URLSearchParams(window.location.search).get("flow") ?? "direct";
    function retainCurrentFlow() {
      if (initialView !== "planner") return;
      const owner = getBrowserAuth()?.currentUser;
      try { retainPlanningContinuation(sessionStorage, { id: owner?.uid ?? null, anonymous: !owner || owner.isAnonymous }, flow); }
      catch { /* Browser navigation still works when storage is unavailable. */ }
    }
    window.addEventListener("pagehide", retainCurrentFlow);
    if (initialView !== "home" && !hasInitialCatalog)
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
      setPlannerAppearance(readPlannerAppearance());
      try {
        setPlannerMode(savedPlannerMode(localStorage.getItem(plannerModeKey)));
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
          setRequest((previous) => ({ ...previous, ...prefs.data, timeZoneConfirmed: !prefs.data.city || prefs.data.city === previous.city && (!prefs.data.country || prefs.data.country === previous.country) }));
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
      restoredDiscovery.current = false;
      void Promise.resolve().then(async () => {
        try {
          await getBrowserAuth()?.authStateReady();
          try { await waitForAccountTransition(); } catch { /* A failed guest transfer remains retryable in account access. */ }
          if (!active) return;
          const owner = getBrowserAuth()?.currentUser;
          const continuation = readPlanningContinuation(sessionStorage, { id: owner?.uid ?? null, anonymous: !owner || owner.isAnonymous }, flow);
          if (continuation?.source === "google") {
            sessionStorage.setItem(activeDiscoveryKey, JSON.stringify(continuation.reference));
            if (continuation.reference.accepted) sessionStorage.setItem(`date-atlas:accepted-pick:${continuation.reference.sessionId}`, continuation.reference.placeId);
            else sessionStorage.removeItem(`date-atlas:accepted-pick:${continuation.reference.sessionId}`);
          } else if (continuation?.source === "catalog") {
            sessionStorage.setItem(activePlanKey, JSON.stringify({ flow, ownerId: continuation.ownerId, expiresAt: continuation.expiresAt, recipe: continuation.recipe }));
            if (continuation.accepted) sessionStorage.setItem("date-atlas:accepted-catalog:v1", continuation.recipe.id);
            else sessionStorage.removeItem("date-atlas:accepted-catalog:v1");
          }
          let stored: unknown = null;
          let discovery: unknown = null;
          try { stored = JSON.parse(sessionStorage.getItem(activePlanKey) || "null"); } catch { /* An unrelated invalid catalog reference must not block a live date. */ }
          const rawDiscovery = sessionStorage.getItem(activeDiscoveryKey);
          try { discovery = JSON.parse(rawDiscovery ?? "null"); } catch { /* A catalog date can still be reopened. */ }
          const currentReference = z.object({ flow: z.string(), sessionId: z.uuid(), placeId: z.string(), expiresAt: z.number(), accepted: z.boolean().default(false), ownerId: z.string().nullable().optional() }).safeParse(discovery);
          const legacy = currentReference.success ? null : restoreDiscoverySession(rawDiscovery, flow);
          const nearby = legacy?.result.nearby;
          const reference = currentReference.success ? currentReference.data : legacy && nearby?.sessionId && nearby.places[0] ? { flow: legacy.flow, sessionId: nearby.sessionId, placeId: nearby.places[0].id, expiresAt: legacy.expiresAt, accepted: legacy.accepted } : null;
          const referenceOwnerMatches = reference && ("ownerId" in reference && typeof reference.ownerId === "string" ? reference.ownerId === owner?.uid : !owner || owner.isAnonymous);
          if (reference && referenceOwnerMatches && reference.flow === flow && draftIsCurrent(reference)) {
            restoredDiscovery.current = true;
            try {
              await planningToken();
              const contextOwner = getBrowserAuth()?.currentUser?.uid;
              const response = await plannerFetch("/api/plans/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reference), signal: AbortSignal.any([catalogController.signal, AbortSignal.timeout(30000)]) });
              const data = z.object({ request: requestSchema, result: recommendationResultSchema }).parse(await readPlanningResponse(response, () => {}));
              if (!active || getBrowserAuth()?.currentUser?.uid !== contextOwner) return;
              setRequest(data.request); setResult(data.result); setView("results");
              sessionStorage.setItem(activeDiscoveryKey, JSON.stringify({ ...reference, ownerId: contextOwner ?? null }));
              if (reference.accepted) sessionStorage.setItem(`date-atlas:accepted-pick:${reference.sessionId}`, reference.placeId);
              return;
            } catch {
              if (!active) return;
              setToast("Your earlier date could not be reopened. Your core answers are kept; try again when your connection is back.");
            }
          }
          if (
            stored && typeof stored === "object" && "flow" in stored && stored.flow === flow &&
            ("ownerId" in stored && typeof stored.ownerId === "string" ? stored.ownerId === owner?.uid : !owner || owner.isAnonymous) &&
            draftIsCurrent(stored) && "recipe" in stored
          ) {
            const recipe = parseSaved(JSON.stringify([stored.recipe]))[0];
            if (recipe) {
              restoredDiscovery.current = true;
              if (await restoreShared(recipe)) return;
            }
          }
          clearUnrestoredResult();
          const raw = continuation?.source === "draft" ? JSON.stringify(continuation.draft) :
            sessionStorage.getItem(draftKey) ||
            Array.from({ length: plannerDraftVersion - 2 }, (_, index) => sessionStorage.getItem(`date-atlas:planning-draft:v${plannerDraftVersion - index - 1}`)).find(Boolean);
          if (!active || !raw) return;
          const draft: unknown = JSON.parse(raw);
          if (!draftMatchesFlow(draft, flow)) return;
          if (draft && typeof draft === "object" && "ownerId" in draft && draft.ownerId && draft.ownerId !== getBrowserAuth()?.currentUser?.uid) return;
          if (!draftIsCurrent(draft)) { clearPlannerDrafts(sessionStorage, plannerDraftVersion); setToast("Your earlier draft expired. Let's start fresh."); return; }
          if (draft && typeof draft === "object" && "request" in draft) {
            const parsed = requestSchema.safeParse(draft.request);
            if (parsed.success) {
              setRequest({ ...parsed.data, durationMode: "estimated", endTime: "" });
              if ("needsPreferenceReview" in draft && draft.needsPreferenceReview === true) setToast("Your core answers are restored. Personal notes and chat messages stay out of browser drafts; please review your preferences.");
              setEditingPlan("editingPlan" in draft && draft.editingPlan === true);
              if ("plannerMode" in draft && savedPlannerMode(draft.plannerMode)) setPlannerMode(savedPlannerMode(draft.plannerMode));
              else if (!("plannerMode" in draft)) setPlannerMode("steps");
              if ("chatSession" in draft) {
                const chat = chatSessionSchema.safeParse(draft.chatSession);
                if (chat.success) setChatSession(chat.data);
              }
              setPlannerStep(
                restorePlannerStep(
                  "needsPreferenceReview" in draft && draft.needsPreferenceReview === true ? Math.min("step" in draft && typeof draft.step === "number" ? draft.step : 0, plannerQuestions.findIndex((item) => item.id === "interests")) : "step" in draft ? draft.step : 0,
                  "version" in draft ? draft.version : undefined,
                  "needsPreferenceReview" in draft && draft.needsPreferenceReview === true ? undefined : "questionId" in draft ? draft.questionId : undefined,
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
        } catch {
          if (active && restoredDiscovery.current) setToast("Your earlier date could not be reopened. Your saved dates remain in your account.");
        } finally {
          if (active) setDraftReady(true);
        }
      });
    }
    const auth = getBrowserAuth();
    let sessionRevision = 0;
    const unsubscribe = auth
      ? onIdTokenChanged(auth, async (user) => {
          if (!active || !mounted.current) return;
          const revision = ++sessionRevision;
          const previous = previousAccount.current;
          previousAccount.current = user ? { uid: user.uid, anonymous: user.isAnonymous } : null;
          if (previous && !previous.anonymous && previous.uid !== user?.uid) {
            setAuthReady(false);
            abortRef.current?.abort(); generationId.current++; setBusy(false);
            setResult(null); setResumePath(null); setRequest(defaultRequest()); setChatSession(emptyChatSession()); setPlannerStep(0); setEditingPlan(false);
            pendingSave.current = null; setSaved([]); setSignedIn(false); setAccountId(""); setDraftReady(true);
            shareController.current?.abort(); shareController.current = null; shareOwner.current = null;
            setShareOpen(false); setShareSelection(null);
            try {
              clearPlannerDrafts(sessionStorage, plannerDraftVersion);
              clearPlanningContinuations(sessionStorage);
              sessionStorage.removeItem(activeDiscoveryKey); sessionStorage.removeItem(activePlanKey);
              sessionStorage.removeItem("date-atlas:accepted-catalog:v1");
              sessionStorage.removeItem(pendingSaveKey); localStorage.removeItem(pendingSaveKey);
              localStorage.removeItem(invitationReturnKey); localStorage.removeItem(pendingInvitationKey); localStorage.removeItem(pendingDateReminderKey);
            } catch { /* Server ownership checks remain authoritative. */ }
            setView(initialView === "planner" ? "planner" : initialView);
          }
          try { await waitForAccountTransition(); } catch { /* The account can load while the separate guest transfer remains retryable. */ }
          if (!active || !mounted.current || revision !== sessionRevision || auth.currentUser?.uid !== user?.uid) return;
          const saveRevision = ++savedRevision.current;
          if (shareOwner.current && shareOwner.current !== user?.uid) {
            shareController.current?.abort(); shareController.current = null; shareOwner.current = null;
            setShareOpen(false); setShareSelection(null);
          }
          setSignedIn(!!user && !user.isAnonymous);
          setAuthReady(true);
          setAccountId(user?.uid ?? "");
          setAccountProfile({ name: user?.displayName ?? null, email: user?.email ?? null });
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
    if (!auth) void Promise.resolve().then(() => { if (active && mounted.current) setAuthReady(true); });
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
          finishAuthentication();
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
      retainCurrentFlow();
      active = false;
      mounted.current = false;
      window.removeEventListener("pagehide", retainCurrentFlow);
      catalogController.abort();
      window.removeEventListener("scroll", onScroll);
      abortRef.current?.abort();
      shareController.current?.abort();
      unsubscribe?.();
      window.removeEventListener("storage", syncStorage);
    };
  }, [initialView, hasInitialCatalog]);
  useLayoutEffect(() => {
    const pathname = window.location.pathname;
    const root = document.documentElement;
    if (pathname === "/" && view === "home") {
      if (authReady && signedIn) root.setAttribute("data-home-account", "true");
      else root.removeAttribute("data-home-account");
      applyPageSurface(root, pathname, plannerAppearance);
    } else if (preferencesReady) applyPageSurface(root, pathname, plannerAppearance);
  }, [plannerAppearance, preferencesReady, authReady, signedIn, view]);
  useEffect(() => {
    if (view !== "home" || !authReady) return;
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        await waitForAccountTransition();
        const owner = getBrowserAuth()?.currentUser;
        const continuation = readPlanningContinuation(sessionStorage, { id: owner?.uid ?? null, anonymous: !owner || owner.isAnonymous });
        if (active) setResumePath(continuation ? continuationPath(continuation) : null);
      } catch { if (active) setResumePath(null); }
    });
    return () => { active = false; };
  }, [view, authReady, accountId]);
  useEffect(() => {
    if (view !== "planner" || !draftReady || !authReady) return;
    if (plannerMode) trackFunnel("planner_started");
    try {
      sessionStorage.setItem(
        draftKey,
        draftJSON({
          ownerId: getBrowserAuth()?.currentUser?.uid ?? null,
          version: plannerDraftVersion,
          flow: new URLSearchParams(window.location.search).get("flow") ?? "direct",
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
  }, [request, plannerStep, view, draftReady, preferredIds, editingPlan, plannerMode, chatSession, accountId, authReady]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(""); setFeedbackState(null); }, 6000);
    return () => clearTimeout(timer);
  }, [toast, toastRevision]);
  function changePlannerAppearance(appearance: PlannerAppearance) {
    setPlannerAppearance(appearance);
    savePlannerAppearance(appearance);
    applyPageSurface(document.documentElement, window.location.pathname, appearance);
  }
  function saveAndExit(event: MouseEvent<HTMLButtonElement>) {
    try {
      sessionStorage.setItem(draftKey, draftJSON({ ownerId: getBrowserAuth()?.currentUser?.uid ?? null, version: plannerDraftVersion, flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", expiresAt: Date.now() + draftLifetimeMs, request, step: plannerStep, preferredIds, editingPlan, plannerMode, chatSession }));
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
            ownerId: getBrowserAuth()?.currentUser?.uid ?? null,
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
      clearPlanningContinuations(sessionStorage);
      for (const key of [activePlanKey, activeDiscoveryKey, pendingSaveKey, "date-atlas:accepted-catalog:v1", rejectedPicksKey(new URLSearchParams(window.location.search).get("flow") ?? "direct")]) sessionStorage.removeItem(key);
      localStorage.removeItem(invitationReturnKey); localStorage.removeItem(pendingInvitationKey); localStorage.removeItem(pendingDateReminderKey);
    } catch { setExitError("Your browser couldn't clear the draft. Please try again before starting over."); return; }
    pendingSave.current = null; rejectionMemory.current = { flow: "", picks: mergeRejectedPicks() };
    setRequest(defaultRequest()); setPlannerStep(0); setEditingPlan(false); setPlannerMode(null); setChatSession(emptyChatSession()); setPreferredIds([]); setResult(null); setError(""); setExitOpen(false);
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
        currency: experience.currency,
        budget: null,
        transportBudget: null,
        area: experience.area,
        vibes: experience.vibes.filter(
          (vibe): vibe is PlanRequest["vibes"][number] =>
            requestSchema.shape.vibes.element.safeParse(vibe).success,
        ),
      },
      experience.id,
    );
  }
  function customize(questionId: PlannerQuestionId = "review") {
    const step = plannerQuestions.findIndex((question) => question.id === questionId);
    const flow = new URLSearchParams(window.location.search).get("flow") ?? "direct";
    let exclusions = mergeRejectedPicks(rejectionMemory.current.flow === flow ? rejectionMemory.current.picks : null, recommendationExclusions(result));
    try { exclusions = mergeRejectedPicks(readRejectedPicks(sessionStorage.getItem(rejectedPicksKey(flow))), exclusions); } catch { /* The current replacement still excludes the previous recommendation. */ }
    rejectionMemory.current = { flow, picks: exclusions };
    const nextPreferredIds = replacementPreferredIds(preferredIds, exclusions.excludeIds);
    setError("");
    setEditingPlan(true);
    setPlannerMode("steps");
    setPreferredIds(nextPreferredIds);
    try {
      sessionStorage.removeItem(activePlanKey);
      sessionStorage.removeItem(activeDiscoveryKey);
      sessionStorage.setItem(rejectedPicksKey(flow), JSON.stringify(exclusions));
    } catch {
      /* The current session remains usable. */
    }
    if (initialView === "planner") {
      setPlannerStep(step);
      setView("planner");
    } else {
      const nextFlow = crypto.randomUUID();
      try {
        sessionStorage.setItem(rejectedPicksKey(nextFlow), JSON.stringify(exclusions));
        sessionStorage.setItem(
          draftKey,
          draftJSON({
            ownerId: getBrowserAuth()?.currentUser?.uid ?? null,
            version: plannerDraftVersion,
            flow: nextFlow,
            request,
            step,
            preferredIds: nextPreferredIds,
            editingPlan: true,
            plannerMode: "steps",
            chatSession,
          }),
        );
      } catch {
        /* Answers remain available in the current itinerary. */
      }
      router.push(`/plan?flow=${nextFlow}`);
    }
  }
  function choosePlannerMode(mode: PlannerMode) {
    if (mode === "chat" && !requestSchema.safeParse(request).success) { setError("Please finish this answer before switching to chat. Your other preferences are kept."); return; }
    const answered = [...new Set([...chatSession.answered, ...(editingPlan ? intakeFields : [])])];
    const nextField = intakeNextField(request, answered);
    setChatSession((previous) => ({ ...previous, answered, nextField }));
    if (mode === "steps" && plannerMode === "chat") setPlannerStep(stepForIntake(nextField));
    trackFunnel("planner_started");
    try { localStorage.setItem(plannerModeKey, mode); } catch { /* This plan still keeps the chosen style in memory. */ }
    setPlannerMode(mode);
    setError("");
    window.scrollTo({ top: 0 });
  }
  function changePlannerStep(step: number) {
    setPlannerStep(step);
  }
  function cancelGeneration() {
    abortRef.current?.abort(); generationId.current++; activeGeneration.current = "";
    setBusy(false); setError("");
    setToast("Planning cancelled. Your answers are kept; you can try again when you're ready.");
  }
  async function generate(
    preferences = request,
    extra: Partial<GenerateInput> = {},
  ) {
    preferences = { ...preferences, durationMode: "estimated", endTime: "" };
    const signature = JSON.stringify({ preferences, extra, preferredIds });
    if (activeGeneration.current === signature && abortRef.current && !abortRef.current.signal.aborted) return;
    activeGeneration.current = signature;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const operationSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]);
    const id = ++generationId.current;
    setBusy(true);
    setError("");
    try {
      const flow = new URLSearchParams(window.location.search).get("flow") ?? "direct";
      let storedRejections = mergeRejectedPicks();
      try { storedRejections = readRejectedPicks(sessionStorage.getItem(rejectedPicksKey(flow))); } catch { /* Memory preserves exclusions when storage is unavailable. */ }
      const exclusions = mergeRejectedPicks(storedRejections, rejectionMemory.current.flow === flow ? rejectionMemory.current.picks : null, extra);
      rejectionMemory.current = { flow, picks: exclusions };
      const nextPreferredIds = replacementPreferredIds(extra.preferredIds ?? preferredIds, exclusions.excludeIds);
      if (nextPreferredIds.length !== preferredIds.length) setPreferredIds(nextPreferredIds);
      try {
        sessionStorage.setItem(rejectedPicksKey(flow), JSON.stringify(exclusions));
        if (extra.excludeIds?.length || extra.excludePlaceIds?.length) {
          sessionStorage.setItem(draftKey, draftJSON({ ownerId: getBrowserAuth()?.currentUser?.uid ?? null, version: plannerDraftVersion, flow, expiresAt: Date.now() + draftLifetimeMs, request: preferences, step: plannerQuestions.length - 1, preferredIds: nextPreferredIds, editingPlan: true, plannerMode, chatSession }));
          sessionStorage.removeItem(activeDiscoveryKey);
          sessionStorage.removeItem(activePlanKey);
        }
      } catch { /* The current request still uses the complete exclusion list. */ }
      setLoadingStage("Preserving your guest session");
      await planningToken(operationSignal);
      operationSignal.throwIfAborted();
      setLoadingStage("Preparing your recommendations");
      const body = JSON.stringify({ request: preferences, flowId: funnelScope(), ...extra, ...exclusions, preferredIds: nextPreferredIds });
      const attempt = generationAttempt.current?.body === body ? generationAttempt.current : { body, key: crypto.randomUUID() };
      generationAttempt.current = attempt;
      const data = recommendationResultSchema.parse(await requestGeneration(body, attempt.key, operationSignal, (stage) => { if (!operationSignal.aborted) setLoadingStage(stage); }));
      operationSignal.throwIfAborted();
      if (id !== generationId.current) return;
      if ((extra.excludePlaceIds?.length || extra.excludeIds?.length) && !data.plans.length && !data.nearby?.places.length)
        throw new Error("No new place matched these preferences. Try changing the location, time or vibe.");
      setRequest(data.request ?? data.plans[0]?.request ?? preferences);
      setResult(data);
      setEditingPlan(false);
      generationAttempt.current = null;
      try {
        if (data.nearby?.places.length) sessionStorage.setItem(activeDiscoveryKey, JSON.stringify(data.nearby.sessionId ? { flow, ownerId: getBrowserAuth()?.currentUser?.uid ?? null, sessionId: data.nearby.sessionId, placeId: data.nearby.places[0].id, expiresAt: Date.now() + 3600000, accepted: false } : { flow, request: draftRequest(data.request ?? preferences), result: { ...data, request: undefined }, expiresAt: Date.now() + 3600000, accepted: false }));
        else sessionStorage.removeItem(activeDiscoveryKey);
        if (data.plans[0]) rememberPlan(data.plans[0]);
        sessionStorage.setItem(draftKey, draftJSON({ ownerId: getBrowserAuth()?.currentUser?.uid ?? null, version: plannerDraftVersion, flow, expiresAt: Date.now() + draftLifetimeMs, request: data.request ?? data.plans[0]?.request ?? preferences, step: plannerQuestions.length - 1, preferredIds: nextPreferredIds, editingPlan: true, plannerMode: plannerMode ?? "steps", chatSession }));
        sessionStorage.removeItem("date-atlas:planning-draft:v12");
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
    const auth = getBrowserAuth();
    let owner = auth?.currentUser?.uid;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++generationId.current;
    setBusy(true);
    try {
      await auth?.authStateReady();
      owner = auth?.currentUser?.uid;
      if (controller.signal.aborted || id !== generationId.current) return;
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
      return true;
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
          ownerId: getBrowserAuth()?.currentUser?.uid ?? null,
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
      try { localStorage.removeItem(invitationReturnKey); localStorage.setItem(pendingSaveKey, JSON.stringify({ recipe: { ...recipe, title: "Your chosen date", request: draftRequest(recipe.request) }, flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", expiresAt: Date.now() + 3600000 })); } catch { /* The current tab retains the action in memory. */ }
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
        body: JSON.stringify({ ...recipe, flowScope: funnelScope() }),
        signal: AbortSignal.timeout(20000),
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
    if (resumingAuth.current) return resumingAuth.current;
    resumingAuth.current = resumeAccountPlan().finally(() => { resumingAuth.current = null; });
    return resumingAuth.current;
  }
  async function resumeAccountPlan() {
    const owner = getBrowserAuth()?.currentUser;
    if (!owner || owner.isAnonymous) return;
    const stillCurrent = () => mounted.current && getBrowserAuth()?.currentUser?.uid === owner.uid;
    try {
      const invitationReturn = localStorage.getItem(invitationReturnKey);
      const raw: unknown = JSON.parse(invitationReturn ?? sessionStorage.getItem(activeDiscoveryKey) ?? "null");
      const context = z.object({ flow: z.string(), sessionId: z.uuid(), placeId: z.string(), expiresAt: z.number(), accepted: z.boolean().default(false) }).safeParse(raw);
      if (context.success && context.data.flow === (new URLSearchParams(window.location.search).get("flow") ?? "direct") && context.data.expiresAt > Date.now() && context.data.expiresAt <= Date.now() + 3600000) {
        const response = await plannerFetch("/api/plans/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context.data), signal: AbortSignal.timeout(30000) });
        const data = z.object({ request: requestSchema, result: recommendationResultSchema }).parse(await readPlanningResponse(response, () => {}));
        if (!stillCurrent()) return;
        if (invitationReturn || context.data.accepted) sessionStorage.setItem(`date-atlas:accepted-pick:${context.data.sessionId}`, context.data.placeId);
        setRequest(data.request); setResult(data.result); setView("results"); setDraftReady(true);
        sessionStorage.setItem(activeDiscoveryKey, JSON.stringify({ ...context.data, ownerId: owner.uid, accepted: !!invitationReturn || context.data.accepted }));
        localStorage.removeItem(invitationReturnKey);
      }
      const catalogReturn = readCatalogAuthReturn(invitationReturn, new URLSearchParams(window.location.search).get("flow") ?? "direct");
      if (catalogReturn && stillCurrent()) {
        if (catalogReturn.accepted) sessionStorage.setItem("date-atlas:accepted-catalog:v1", catalogReturn.recipe.id);
        else sessionStorage.removeItem("date-atlas:accepted-catalog:v1");
        const current = result?.plans[0]?.id === catalogReturn.recipe.id;
        sessionStorage.setItem(activePlanKey, JSON.stringify({ ...catalogReturn, ownerId: owner.uid }));
        if (!current) setRequest(catalogReturn.recipe.request);
        if ((current || await restore(catalogReturn.recipe)) && stillCurrent()) localStorage.removeItem(invitationReturnKey);
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
    const owner = getBrowserAuth()?.currentUser?.uid;
    const token = await getAuthToken().catch(() => null);
    if (getBrowserAuth()?.currentUser?.uid !== owner) return;
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
    if (!mounted.current || getBrowserAuth()?.currentUser?.uid !== owner) return;
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
      try { localStorage.removeItem(invitationReturnKey); localStorage.setItem(pendingSaveKey, JSON.stringify({ recipe: { ...recipe, title: "Your chosen date", request: draftRequest(recipe.request) }, action: "share", flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", expiresAt: Date.now() + 3600000 })); } catch { /* The current tab retains the action in memory. */ }
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
      const response = await plannerFetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "catalog", recipe, flowScope: funnelScope() }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
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
    const plan = result?.plans[0];
    if ((!user || user.isAnonymous) && plan && !pendingSave.current) {
      try {
        const recipe = toRecipe(plan);
        localStorage.setItem(invitationReturnKey, JSON.stringify({ flow: new URLSearchParams(window.location.search).get("flow") ?? "direct", expiresAt: Date.now() + draftLifetimeMs, accepted: sessionStorage.getItem("date-atlas:accepted-catalog:v1") === plan.id, recipe: { ...recipe, title: "Your chosen date", request: draftRequest(recipe.request) } }));
      } catch { /* The current tab keeps the selected date in memory. */ }
    }
    setAuthAccountView(!!user && !user.isAnonymous && !hasPendingAccountTransfer());
    setAuthOpen(true);
  }
  function authenticationDone() {
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous) return;
    setSignedIn(true); setAccountId(user.uid); setAuthOpen(false); setAuthMessage("");
    if (result?.plans[0]) rememberPlan(result.plans[0]);
    setHistoryRevision((value) => value + 1);
    trackFunnel("authentication_completed");
    void refreshSavedPlans(); void resumeAfterAuth();
    setToast("You're signed in. Your current date is still here.");
  }
  const planning = view === "planner";
  const themedJourney = planning || view === "results";
  if (!authReady) return <PlannerLoadingScreen context={initialView === "home" ? "home" : "planner"} theme={initialView === "planner" ? plannerAppearance : "red"} />;
  if (initialView === "planner" && !draftReady) return <PlannerInitializing theme={plannerAppearance} />;
  const authenticatedLayout = signedIn && !planning && view !== "results";
  return (
      <div
        className={`atlas-app ${authenticatedLayout ? authenticatedStyles.shell : ""} ${themedJourney ? plannerStyles.palette : ""} ${planning ? `is-planning ${plannerStyles.planner}` : ""} ${view === "home" && !signedIn ? "is-lover-intro" : ""} ${signedIn && !planning ? "has-mobile-nav" : ""} ${view === "results" ? `has-itinerary ${plannerStyles.journey}` : ""}`}
        data-planner-theme={themedJourney ? plannerAppearance : undefined}
        data-planner-mode={planning ? plannerMode ?? undefined : undefined}
      >
        <header className={`atlas-header ${authenticatedLayout ? authenticatedStyles.header : ""} ${compactHeader ? "compact" : ""}`}>
          <Link
            className="atlas-wordmark"
            href="/"
            aria-label="A Date At las home"
            title="adal — A Date At las"
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
          ) : authenticatedLayout ? (
            <><nav className={authenticatedStyles.navigation} aria-label="Main navigation"><Link href="/" aria-current={view === "home" ? "page" : undefined}><Compass size={17} aria-hidden="true" />Discover</Link><Link href="/saved" aria-current={view === "saved" ? "page" : undefined}><CalendarDays size={17} aria-hidden="true" />My dates</Link><Link href="/profile" aria-current={view === "profile" ? "page" : undefined}><UserRound size={17} aria-hidden="true" />Profile</Link></nav>{view !== "home" && view !== "saved" && <Button className={authenticatedStyles.plan} size="small" onClick={() => planDate()}>Plan a date<ArrowRight size={15} aria-hidden="true" /></Button>}</>
          ) : view === "home" ? (
            <div className="header-actions">
              {signedIn && <Link href="/saved">My dates</Link>}
              <button onClick={() => signedIn ? router.push("/profile") : openAuthentication()}>{signedIn ? "My account" : "Sign in"}</button>
            </div>
          ) : (
            <>
              <nav className="desktop-nav" aria-label="Main navigation">
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
        {view === "home" && signedIn && resumePath && <div className="content-width"><Button variant="outline" size="small" onClick={() => router.push(resumePath)}>Continue planning<ArrowRight size={16} aria-hidden="true" /></Button></div>}
        {view === "home" && (signedIn ? preferencesReady && <PlaceDiscovery key={`${accountId}:${request.city}:${request.country}`} city={request.city} country={request.country} onPlan={() => planDate()} onPlanNearby={(place, destination) => {
          const currency = currencyForCountry(destination.country) ?? request.currency;
          planDate({ city: destination.city, currentCity: destination.city, country: destination.country, area: place.name.slice(0, 80), locationScope: "area", maxDistance: 15, startingArea: "", timeZoneConfirmed: false, currency, ...(currency !== request.currency ? { budget: null, transportBudget: null } : {}) });
        }} /> : authReady ? <Homepage onResume={resumePath ? () => router.push(resumePath) : undefined} onPlan={() => { try { clearPlannerDrafts(sessionStorage, plannerDraftVersion); } catch { /* A new flow can still open without storage. */ } planDate(); }} /> : <PlannerLoadingScreen theme={plannerAppearance} />)}
        {view === "explore" && (
          <Explore
            initialExperiences={initialCatalog}
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
              <Button variant="outline" onClick={() => planDate()}>
                Plan a date
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
                <Button onClick={() => planDate()}>Plan a date</Button>
              </div>
            )}
          </main>
        )}
        {view === "profile" && preferencesReady && (
          <ProfilePreferences
            key={accountId}
            accountName={accountProfile.name}
            accountEmail={accountProfile.email}
            request={request}
            signedIn={signedIn}
            onAuth={openAuthentication}
            onSave={(preferences) => {
              try {
                localStorage.setItem(
                  preferencesKey,
                  JSON.stringify(preferences),
                );
                setRequest((previous) => ({ ...previous, ...preferences, timeZoneConfirmed: !preferences.city || preferences.city === previous.city && (!preferences.country || preferences.country === previous.country) }));
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
        {planning && (!draftReady || plannerMode === null && busy) && <PlannerInitializing theme={plannerAppearance} overlay />}
        {planning && draftReady && plannerMode === null && !busy && <PlannerModeChoice onChoose={choosePlannerMode} />}
        {planning && draftReady && plannerMode === "chat" && <Suspense fallback={<PlannerInitializing theme={plannerAppearance} overlay />}><PlannerChat appearance={plannerAppearance} onCancelGeneration={cancelGeneration} request={request} setRequest={setRequest} session={chatSession} setSession={setChatSession} onGenerate={() => generate()} loading={busy} loadingStage={loadingStage} serverError={error} /></Suspense>}
        {planning && draftReady && plannerMode === "steps" && (
          <Suspense fallback={<PlannerInitializing theme={plannerAppearance} overlay />}>
            <PlannerWizard
              request={request}
              setRequest={setRequest}
              step={plannerStep}
              editingPlan={editingPlan}
              answered={chatSession.answered}
              onAnswer={(id, updated) => {
                const field = intakeFieldForQuestion(id);
                if (field) setChatSession((previous) => {
                  const answered = [...new Set([...previous.answered, field])];
                  return { ...previous, answered, nextField: intakeNextField(updated, answered) };
                });
              }}
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
          </Suspense>
          )}
        {view === "results" && result && (
          <Suspense fallback={<GeneratingScreen theme={plannerAppearance} stage="Getting your date ready to reveal…" />}>
          <Results
            result={result}
            planningRequest={request}
            signedIn={signedIn && !authOpen && !authBusy && !authTransferPending}
            accountRevision={`${accountId}:${historyRevision}`}
            onSignIn={openAuthentication}
            onActivePlan={rememberPlan}
            setResult={(next) => {
              setResult(next);
              if (next.plans.length) setRequest(next.plans[0].request);
            }}
            onCustomize={() => customize()}
            onEditPreference={customize}
            onChangeTiming={() => customize("time")}
            onBack={() => router.push("/")}
            onSave={(plan) => void savePlan(plan)}
            onShare={(plan) => void sharePlan(plan)}
            onCancelGeneration={cancelGeneration}
            onRegenerate={generate}
            busy={busy}
            requestError={error}
            loadingStage={loadingStage}
          />
          </Suspense>
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
            {view !== "home" && !signedIn && <footer className="atlas-footer content-width">
              <div>
                <Link className="atlas-wordmark" href="/">
                  A Date At las<span>.</span>
                </Link>
                <small>Thoughtful dates, wherever you are</small>
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
                <Link href="/saved">My dates</Link>
                <Link href="/favorites">Favorites</Link>
              </div>
              <div>
                <strong>A little about us</strong>
                <Link href="/about">About A Date At las</Link>
                <Link href="/partners">Partner with us</Link>
                <button onClick={() => setInfoPage("Help & support")}>Help &amp; support</button>
              </div>
              <div>
                <strong>The details</strong>
                {["Privacy policy", "Terms"].map((page) => (
                  <button key={page} onClick={() => setInfoPage(page)}>
                    {page}
                  </button>
                ))}
              </div>
              <div className="footer-bottom">
                <span>© {new Date().getFullYear()} A Date At las</span>
                <span>Thoughtful dates, wherever life takes you.</span>
              </div>
            </footer>}
            {authenticatedLayout && <footer className={authenticatedStyles.footer}><Link href="/about">About</Link><Link href="/partners">Partner with us</Link><Link href="/privacy">Privacy</Link><a href={`mailto:${supportEmail}`}>Support</a></footer>}
            {signedIn && (
              <nav className={authenticatedLayout ? authenticatedStyles.mobile : "mobile-nav"} aria-label="Mobile navigation">
                <Link
                  href="/"
                  aria-current={view === "home" ? "page" : undefined}
                >
                  <Compass size={21} aria-hidden="true" />
                  Discover
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
                traveling or paying. A Date At las does not collect booking payments.
              </p>
              <Link href="/terms">Read the full terms, including Google Maps terms</Link>
            </>
          ) : (
            <>
              <p>
                Tell Oge what you have in mind, by typing or using the microphone,
                or answer one question at a time. You can correct your answers
                and ask for another suggestion as you go.
              </p>
              <p>
                No suitable plan? Try a different start time, area, or vibe.
                Your spending limit stays unchanged; unconfirmed venue costs
                still need checking. Sign in to reopen and edit a saved date in My dates.
              </p>
              <p>Need a hand? Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> or <a href={`mailto:${supportInbox}`}>{supportInbox}</a>.</p>
            </>
          )}
        </Dialog>
        <Dialog open={shareOpen && !authOpen && signedIn} onOpenChange={(open) => { setShareOpen(open); if (!open) { shareController.current?.abort(); shareController.current = null; } }} title="Your date invitation" description="Choose how to share your invitation.">
          <div className="form-stack">
            <h2>{shareSelection ? "Your invitation is ready." : shareError ? "A little detour." : "Preparing your invitation…"}</h2>
            <p>Anyone with this link can see the chosen venue, day, time and date story, and respond. Your budget, private preferences and account details stay private. You can revoke the link at any time.</p>
            {shareError && <p role="alert" className="error-message">{shareError}</p>}
            {shareSelection ? <>
              <InvitationNote key={shareSelection.token} selection={shareSelection} onDirtyChange={setInvitationDirty} onSaved={(message) => setShareSelection((previous) => previous ? { ...previous, message } : previous)} />
              <Button disabled={invitationDirty} onClick={() => void sendCatalogInvitation()}>Share with your date</Button>
              <Button variant="outline" disabled={invitationDirty} onClick={() => void sendCatalogInvitation(true)}>Copy invitation link</Button>
              <a className="button button-outline" aria-disabled={invitationDirty} onClick={(event) => { if (invitationDirty) event.preventDefault(); }} href={`https://wa.me/?text=${encodeURIComponent(`I've planned a little something for us. Will you come? ${window.location.origin}/invite/${shareSelection.token}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
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
            <h1>Account settings</h1>
            {accountProfile.email && <p>{accountProfile.email}</p>}
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
            <LegacyPlans onImported={(recipe) => setSaved(previous => [recipe, ...previous.filter(item => item.id !== recipe.id)])} />
            </>
          ) : (
            <AccountAccess onDone={authenticationDone} />
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
