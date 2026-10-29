"use client";
import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from "react";
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
import { AccountAccess } from "./account-access";
import { AuthScreen } from "./auth-screen";
import { planningToken, plannerFetch, readPlanningResponse } from "@/lib/firebase/planner-client";
import { AnimatedFeedback } from "@/components/animations/feedback";
import { recommendationResultSchema } from "@/lib/planner/response-schema";
import { Homepage } from "./homepage";
import { Explore, ExperienceCard } from "./explore";
import { ExperiencePage } from "./experience-page";
import { Dashboard, ProfilePreferences } from "./dashboard";
import { preferenceSchema } from "@/lib/planner/preferences-storage";
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
  encodeShare,
  parseSaved,
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
const Results = dynamic(() =>
  import("./results").then((module) => module.Results),
);
const storageKey = "date-atlas:saved:v1";
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
  const [plannerStep, setPlannerStep] = useState(0);
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
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [loadingStage, setLoadingStage] = useState("Checking your preferences");
  const [feedbackState, setFeedbackState] = useState<"success" | "error" | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const generationId = useRef(0);
  const restoreShared = useEffectEvent((recipe: SavedRecipe) => {
    void restore(recipe);
  });
  useEffect(() => {
    let active = true;
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
    Promise.resolve()
      .then(() => parseSaved(localStorage.getItem(storageKey)))
      .then((items) => {
        if (active) setSaved(items);
      })
      .catch(() => {
        if (active)
          setToast(
            "Device storage is unavailable. You can still plan and share a date.",
          );
      });
    if (initialView === "planner") {
      Promise.resolve().then(() => {
        if (!active) return;
        try {
          const stored: unknown = JSON.parse(
            sessionStorage.getItem(activePlanKey) || "null",
          );
          const flow =
            new URLSearchParams(window.location.search).get("flow") ?? "direct";
          if (
            flow &&
            stored &&
            typeof stored === "object" &&
            "flow" in stored &&
            stored.flow === flow &&
            "recipe" in stored
          ) {
            const recipe = parseSaved(JSON.stringify([stored.recipe]))[0];
            if (recipe) restoreShared(recipe);
          }
        } catch {
          /* A new plan remains available when a session recipe is invalid. */
        }
      });
      Promise.resolve()
        .then(
          () =>
            sessionStorage.getItem(draftKey) ||
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
          if (!active || !raw) return;
          const draft: unknown = JSON.parse(raw);
          if (draft && typeof draft === "object" && "request" in draft) {
            const parsed = requestSchema.safeParse(draft.request);
            if (parsed.success) {
              setRequest("version" in draft && (draft.version === plannerDraftVersion || draft.version === 10 || draft.version === 9) ? parsed.data : { ...parsed.data, date: "", startTime: "", endTime: "" });
              setPlannerStep(
                restorePlannerStep(
                  "step" in draft ? draft.step : 0,
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
          setSignedIn(!!user && !user.isAnonymous);
          setAccountId(user?.uid ?? "");
          try {
            setSaved(parseSaved(localStorage.getItem(storageKey)));
          } catch {
            setSaved([]);
          }
          if (user)
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
                if (active && revision === sessionRevision)
                  setSaved((previous) => [
                    ...new Map(
                      [
                        ...parseSaved(JSON.stringify(data.plans)),
                        ...previous,
                      ].map((item) => [item.id, item]),
                    ).values(),
                  ]);
              })
              .catch(() => {
                if (active && revision === sessionRevision)
                  setToast(
                    "Your device plans are ready. Cloud plans couldn't be loaded.",
                  );
              });
        })
      : undefined;
    void Promise.resolve().then(async () => {
      if (!active || !hasEmailSignInLink()) return;
      const email = storedSignInEmail();
      setAuthOpen(true);
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
      if (event.key === storageKey) setSaved(parseSaved(event.newValue));
    }
    window.addEventListener("storage", syncStorage);
    return () => {
      active = false;
      catalogController.abort();
      window.removeEventListener("scroll", onScroll);
      abortRef.current?.abort();
      unsubscribe?.();
      window.removeEventListener("storage", syncStorage);
    };
  }, [initialView]);
  useEffect(() => {
    if (view !== "planner" || !draftReady) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          version: plannerDraftVersion,
          request,
          step: plannerStep,
          preferredIds,
        }),
      );
      for (const version of [2, 3, 4, 5, 6, 7, 8, 9, 10]) sessionStorage.removeItem(`date-atlas:planning-draft:v${version}`);
    } catch {
      /* The current session still works when storage is unavailable. */
    }
  }, [request, plannerStep, view, draftReady, preferredIds]);
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
      sessionStorage.setItem(draftKey, JSON.stringify({ version: plannerDraftVersion, request, step: plannerStep, preferredIds }));
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
          JSON.stringify({
            version: plannerDraftVersion,
            request: { ...request, ...patch },
            step: 0,
            preferredIds: preferred ? [preferred] : [],
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
  function customize(step = 0) {
    setError("");
    try {
      sessionStorage.removeItem(activePlanKey);
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
          JSON.stringify({
            version: plannerDraftVersion,
            request,
            step,
            preferredIds,
          }),
        );
      } catch {
        /* Answers remain available in the current itinerary. */
      }
      planDate();
    }
  }
  async function generate(
    preferences = request,
    extra: Partial<GenerateInput> = {},
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++generationId.current;
    setBusy(true);
    setError("");
    try {
      setLoadingStage("Preserving your guest session");
      await planningToken();
      if (controller.signal.aborted) return;
      setLoadingStage("Preparing your recommendations");
      const response = await plannerFetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ request: preferences, preferredIds, ...extra }),
        signal: controller.signal,
      });
      const data = recommendationResultSchema.parse(await readPlanningResponse(response, (stage) => { if (!controller.signal.aborted) setLoadingStage(stage); }));
      if (controller.signal.aborted || id !== generationId.current) return;
      if (extra.excludePlaceIds?.length && !data.plans.length && !data.nearby?.places.length)
        throw new Error("No new places matched these preferences. Your current recommendations are still here. Try changing the location or vibe.");
      setRequest(data.plans[0]?.request ?? preferences);
      setResult(data);
      try {
        sessionStorage.removeItem(draftKey);
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
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Please try again.",
        );
    } finally {
      if (id === generationId.current && !controller.signal.aborted)
        setBusy(false);
    }
  }
  async function restore(recipe: SavedRecipe) {
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
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "This plan couldn't be opened.");
      if (controller.signal.aborted || id !== generationId.current) return;
      setRequest(recipe.request);
      setResult(data);
      setView("results");
      window.scrollTo({ top: 0 });
    } catch (failure) {
      if (!controller.signal.aborted)
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
          recipe: toRecipe(plan),
        }),
      );
    } catch {
      /* Saving and sharing still work when session storage is unavailable. */
    }
  }
  async function savePlan(plan: DatePlan) {
    const recipe = toRecipe(plan);
    const next = [
      recipe,
      ...saved.filter((item) => item.id !== recipe.id),
    ].slice(0, 100);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setToast("A lovely plan, kept for later. Saved on this device.");
    } catch {
      setToast(
        "Your browser couldn't save this plan. Try copying a share link.",
      );
      return;
    }
    const token = await planningToken().catch(() => null);
    if (signedIn && !token) {
      setToast("Saved on this device. Account sync is temporarily unavailable.");
      return;
    }
    if (token) {
      try {
        const response = await fetch("/api/saved-plans", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(recipe),
        });
        if (!response.ok) throw new Error();
        setFeedbackState("success");
        setToast(signedIn ? "Saved to your account and this device." : "Saved in your guest session. Create an account to keep it across devices.");
      } catch {
        setToast(
          "Saved on this device. Account sync is temporarily unavailable.",
        );
      }
    }
  }
  async function removeSaved(id: string) {
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
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setToast("Plan removed from your saved collection.");
    } catch {
      setToast("Your browser couldn't update saved plans.");
    }
  }
  async function sharePlan(plan: DatePlan, whatsapp = false) {
    const link = new URL(window.location.origin);
    link.searchParams.set("plan", encodeShare(plan));
    if (whatsapp) {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`A little something for us: ${plan.title}${plan.demo ? " (demo itinerary)" : ""}. ${link.toString()}`)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(link.toString());
      setToast(
        "Link copied. Includes your itinerary, schedule, and budget; personal notes are excluded.",
      );
    } catch {
      setToast(
        "Copying is unavailable in this browser. Try sharing on WhatsApp.",
      );
    }
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
                    <AlertDialogDescription>Save your answers and return to the homepage. You can pick up where you left off in this browser tab.</AlertDialogDescription>
                  </AlertDialogHeader>
                  {exitError && <p role="alert" className={plannerStyles.saveError}>{exitError}</p>}
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
              <button onClick={() => signedIn ? router.push("/profile") : setAuthOpen(true)}>{signedIn ? "My account" : "Sign in"}</button>
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
                    signedIn ? router.push("/profile") : setAuthOpen(true)
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
            onAuth={() => setAuthOpen(true)}
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
        {planning &&
          (draftReady ? (
            <PlannerWizard
              request={request}
              setRequest={setRequest}
              step={plannerStep}
              theme={plannerAppearance}
              setStep={setPlannerStep}
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
          ) : (
            <main className="planning-loader">
              <p>Getting your questions ready…</p>
            </main>
          ))}
        {view === "results" && result && (
          <Results
            result={result}
            planningRequest={request}
            signedIn={signedIn && !authOpen}
            accountRevision={`${accountId}:${historyRevision}`}
            onSignIn={() => setAuthOpen(true)}
            onActivePlan={rememberPlan}
            setResult={(next) => {
              setResult(next);
              if (next.plans.length) setRequest(next.plans[0].request);
            }}
            onCustomize={() => customize()}
            onChangeDestination={() => customize(plannerQuestions.findIndex((question) => question.id === "area"))}
            onBack={() => router.push("/")}
            onSave={(plan) => void savePlan(plan)}
            onShare={(plan, whatsapp) => void sharePlan(plan, whatsapp)}
            onRegenerate={generate}
            busy={busy}
            requestError={error}
          />
        )}
        {view === "saved" && (
          <Dashboard
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
                Your answers are used to create your itinerary. Drafts are kept
                in this browser session. Saved plans, favorites, and preferences
                stay on this device unless you sign in to sync plans.
              </p>
              <p>
                When configured, DeepSeek receives planning preferences to
                personalize recommendations. Share links include the itinerary,
                budget, and schedule, but omit gender answers, personal
                interests, dislikes, and notes.
              </p>
              <p>
                You can delete device saves and preferences from My dates and
                Profile. “Use My Location” asks for your permission and sends coordinates to Google to identify your neighborhood. Precise device coordinates are not saved. You can choose an area manually instead.
              </p>
              <Link href="/privacy">Read the full privacy policy</Link>
            </>
          ) : infoPage === "Terms" ? (
            <>
              <p>
                This is a demonstration of a date at las. Fictional records are
                labeled demo. Estimates are not confirmed prices, reservations,
                traffic reports, or availability guarantees.
              </p>
              <p>
                Check current details directly with a real provider before
                traveling or paying. No payment is collected by this demo.
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
                compare the plans that fit. Use Swap or your date assistant to
                refine the itinerary.
              </p>
              <p>
                No suitable plan? Try a different start time, area, or vibe.
                Your maximum budget is always kept. Use My dates to reopen a
                device save; prices and schedules are checked again.
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
        <AuthScreen
          open={authOpen}
          onOpenChange={setAuthOpen}
          signedIn={signedIn}
        >
          {signedIn ? (
            <>
            <span className="eyebrow">YOUR NEXT CHAPTER</span>
            <h1>Good to have you here.</h1>
            <p>New saved plans can sync to your account. Your local collection stays on this device.</p>
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
                  "You're logged out. Device saves are still available.",
                );
              }}
            >
              Log out
            </Button>
            </>
          ) : (
            <AccountAccess onDone={() => { setAuthOpen(false); setHistoryRevision((value) => value + 1); setFeedbackState("success"); setToast("You're signed in. Your guest dates stay with you."); }} />
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
