"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, CalendarDays, Heart, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { vibes, type Experience, type PlanRequest } from "@/lib/planner/schema";
import type { SavedRecipe } from "@/lib/planner/saved";
import {
  preferenceSchema,
  type StoredPreferences,
} from "@/lib/planner/preferences-storage";
import { LottieAnimation } from "@/components/animations/lottie-animation";
import { money } from "@/lib/utils";
import { DateHistory } from "./date-history";

export function Dashboard({
  saved,
  favorites,
  catalog,
  signedIn,
  busy,
  onPlan,
  onOpen,
  onRemove,
  onFavorites,
  onProfile,
  historyRevision = 0,
}: {
  saved: SavedRecipe[];
  favorites: string[];
  catalog: Experience[];
  signedIn: boolean;
  busy: boolean;
  onPlan: () => void;
  onOpen: (recipe: SavedRecipe) => void;
  onRemove: (id: string) => void;
  onFavorites: () => void;
  onProfile: () => void;
  historyRevision?: number;
}) {
  const [tab, setTab] = useState("All plans");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
  });
  const upcoming = saved.filter((item) => item.request.date >= today);
  const items =
    tab === "Upcoming"
      ? upcoming
      : tab === "Past dates"
        ? saved.filter((item) => item.request.date < today)
        : saved;
  return (
    <main className="dashboard-page page-container">
      <div className="dashboard-welcome">
        <div>
          <span className="eyebrow">A LITTLE SOMETHING TO LOOK FORWARD TO</span>
          <h1>
            Your next memory
            <br />
            starts here.
          </h1>
          <p>
            {signedIn
              ? "Your plans, in one lovely place."
              : "Your device collection. Sign in to sync new plans across devices."}
          </p>
          <Button onClick={onPlan}>
            Plan a date
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="dashboard-art">
          <Image
            src="/images/date-atlas-hero.png"
            alt="Illustrative creative date inspiration"
            fill
            sizes="300px"
          />
        </div>
      </div>
      {signedIn && <DateHistory key={historyRevision} onPlan={onPlan} />}
      {(saved.length > 0 || !signedIn) && <>
      <div className="dashboard-stats">
        <div>
          <CalendarDays size={20} />
          <strong>{upcoming.length}</strong>
          <span>Upcoming dates</span>
        </div>
        <button onClick={onFavorites}>
          <Heart size={20} />
          <strong>{favorites.length}</strong>
          <span>
            Favorite experiences
            <ArrowRight size={14} />
          </span>
        </button>
        <button onClick={onProfile}>
          <Settings2 size={20} />
          <strong>Your kind of date</strong>
          <span>
            Edit personal preferences
            <ArrowRight size={14} />
          </span>
        </button>
      </div>
      <div className="section-heading">
        <h2>A collection of good days.</h2>
        <div className="segmented-control">
          {["All plans", "Upcoming", "Past dates"].map((label) => (
            <button
              key={label}
              aria-pressed={tab === label}
              className={tab === label ? "active" : ""}
              onClick={() => setTab(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!items.length ? (
        <div className="empty-state">
          <LottieAnimation animation="empty" label="Your next great memory has not been planned yet" width={240} height={170} />
          <h2>
            {tab === "Past dates"
              ? "A story yet to be written."
              : "No plans yet? Let's change that."}
          </h2>
          <p>
            {tab === "Past dates"
              ? "Plans scheduled before today appear here. A past date doesn't confirm attendance."
              : "A little inspiration can turn into your next favourite memory."}
          </p>
          <Button onClick={onPlan}>
            Plan your first date
            <ArrowRight size={16} />
          </Button>
        </div>
      ) : (
        <div className="saved-grid">
          {items.map((recipe) => {
            const experience = catalog.find((item) =>
              recipe.experienceIds.includes(item.id),
            );
            return (
              <article className="saved-card" key={recipe.id}>
                <div className="saved-image">
                  <Image
                    src={experience?.image || "/images/pottery.jpg"}
                    alt="Illustrative date atmosphere"
                    fill
                    sizes="(max-width:700px) 90vw, 33vw"
                  />
                  <span className="tag">{recipe.request.occasion}</span>
                </div>
                <div>
                  <span className="mini-label">
                    {recipe.request.date} · {recipe.request.area}
                  </span>
                  <h3>{recipe.title}</h3>
                  <p>
                    {recipe.experienceIds.length} experiences · Budget{" "}
                    {recipe.request.budget === null ? "Not set" : money(
                      recipe.request.budget *
                        (recipe.request.budgetType === "per-person"
                          ? recipe.request.guests
                          : 1),
                    )}
                  </p>
                  <div className="saved-actions">
                    <Button
                      size="small"
                      disabled={busy}
                      onClick={() => onOpen(recipe)}
                    >
                      {busy ? "Opening…" : "View plan"}
                      <ArrowRight size={14} />
                    </Button>
                    <button
                      className="text-link"
                      onClick={() => onRemove(recipe.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </>}
    </main>
  );
}

export function ProfilePreferences({
  request,
  signedIn,
  onAuth,
  onSave,
  onReset,
}: {
  request: PlanRequest;
  signedIn: boolean;
  onAuth: () => void;
  onSave: (preferences: StoredPreferences) => void;
  onReset: () => void;
}) {
  const [preferences, setPreferences] = useState(() =>
    preferenceSchema.parse(request),
  );
  const [error, setError] = useState("");
  function update<K extends keyof StoredPreferences>(
    key: K,
    value: StoredPreferences[K],
  ) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
    setError("");
  }
  return (
    <main className="profile-page page-container">
      <div className="results-heading">
        <div>
          <span className="eyebrow">THE LITTLE THINGS THAT MAKE YOU, YOU</span>
          <h1>A little more personal.</h1>
          <p>Your preferences help shape the next date you plan.</p>
        </div>
        <Button variant="outline" onClick={onAuth}>
          {signedIn ? "Manage account" : "Sign in or create account"}
        </Button>
      </div>
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = preferenceSchema.safeParse(preferences);
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          onSave(parsed.data);
        }}
      >
        <section>
          <h2>Your usual starting point.</h2>
          <div className="field-grid">
            <Field label="City">
              <input
                value={preferences.city || ""}
                onChange={(event) => update("city", event.target.value)}
              />
            </Field>
            <Field label="Area">
              <input
                value={preferences.area || ""}
                onChange={(event) => update("area", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Comfortable total budget (₦, optional)">
            <input
              type="number"
              min={1000}
              max={10000000}
              value={preferences.budget || ""}
              onChange={(event) => {
                update("budget", event.target.value ? Number(event.target.value) : null);
                update("budgetType", "total");
              }}
            />
          </Field>
        </section>
        <section>
          <h2>Your kind of together.</h2>
          <div className="pill-group">
            {vibes.map((vibe) => (
              <button
                key={vibe}
                type="button"
                className={`filter-pill ${preferences.vibes?.includes(vibe) ? "active" : ""}`}
                aria-pressed={preferences.vibes?.includes(vibe) || false}
                onClick={() =>
                  update(
                    "vibes",
                    preferences.vibes?.includes(vibe)
                      ? preferences.vibes.filter((item) => item !== vibe)
                      : [...(preferences.vibes || []), vibe],
                  )
                }
              >
                {vibe}
              </button>
            ))}
          </div>
          <Field label="Interests">
            <textarea
              rows={3}
              maxLength={1000}
              value={preferences.interests || ""}
              onChange={(event) => update("interests", event.target.value)}
            />
          </Field>
          <Field label="Things you'd rather skip">
            <input
              maxLength={500}
              value={preferences.dislikes || ""}
              onChange={(event) => update("dislikes", event.target.value)}
            />
          </Field>
          <label className="plain-toggle">
            <input
              type="checkbox"
              checked={preferences.quiet || false}
              onChange={(event) => update("quiet", event.target.checked)}
            />
            Prefer quiet places
          </label>
          <label className="plain-toggle">
            <input
              type="checkbox"
              checked={preferences.accessibility || false}
              onChange={(event) =>
                update("accessibility", event.target.checked)
              }
            />
            Step-free access required
          </label>
          <Field label="Food preferences">
            <select
              value={preferences.dietary?.[0] || ""}
              onChange={(event) =>
                update(
                  "dietary",
                  event.target.value
                    ? [event.target.value as PlanRequest["dietary"][number]]
                    : [],
                )
              }
            >
              <option value="">No restriction</option>
              {["vegetarian", "vegan", "halal", "gluten-free"].map((diet) => (
                <option key={diet}>{diet}</option>
              ))}
            </select>
          </Field>
        </section>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="profile-actions">
          <Button>Save preferences</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onReset();
              setPreferences({});
            }}
          >
            Delete saved preferences
          </Button>
        </div>
        <p className="secondary-notice">
          Preferences are saved on this device. You can edit or clear them at
          any time. Existing saved plans keep their original answers.
        </p>
      </form>
    </main>
  );
}
