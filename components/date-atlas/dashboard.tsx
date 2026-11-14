"use client";

import { zonedNow } from "@/lib/planner/schedule";
import { currencyDigits, currencyOptions, currencyForCountry } from "@/lib/planner/currency";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Settings2, UserRound } from "lucide-react";
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
import styles from "./dashboard.module.css";

export function Dashboard({
  saved,
  catalog,
  signedIn,
  busy,
  onPlan,
  onReplan,
  onOpen,
  onRemove,
  onHistoryChanged,
  historyRevision = 0,
}: {
  saved: SavedRecipe[];
  favorites: string[];
  catalog: Experience[];
  signedIn: boolean;
  busy: boolean;
  onPlan: () => void;
  onReplan: (request: PlanRequest) => void;
  onOpen: (recipe: SavedRecipe) => void;
  onRemove: (id: string) => void;
  onFavorites: () => void;
  onProfile: () => void;
  onLegacyImported: (recipe: SavedRecipe) => void;
  onHistoryChanged: () => void;
  historyRevision?: number;
}) {
  const [tab, setTab] = useState("All plans");
  const now = new Date();
  const upcoming = saved.filter((item) => item.request.date >= zonedNow(item.request.timeZone, now).date);
  const items =
    tab === "Upcoming"
      ? upcoming
      : tab === "Past dates"
        ? saved.filter((item) => item.request.date < zonedNow(item.request.timeZone, now).date)
        : saved;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>My dates</h1>
          <p>{signedIn ? "Your saved places, plans and invitations." : "Sign in to keep your plans together across devices."}</p>
        </div>
        <div className="saved-actions">
          {signedIn && <Button asChild variant="outline"><Link href="/wishlist">Shared wishlist</Link></Button>}
          <Button onClick={onPlan}>Plan a date<ArrowRight size={16} aria-hidden="true" /></Button>
        </div>
      </header>
      {signedIn && <DateHistory key={historyRevision} onPlan={onPlan} onChanged={onHistoryChanged} onReplan={onReplan} />}
      {(saved.length > 0 || !signedIn) && <>
      <div className={styles.collectionHeader}>
        <h2>Saved plans</h2>
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
              ? "No past dates here yet."
              : tab === "Upcoming" ? "Nothing coming up yet." : "Your next date starts here."}
          </h2>
          <p>
            {tab === "Past dates"
              ? "Dates scheduled before today appear here. Only you can tell us whether they happened."
              : "Save a plan you like, and we’ll keep it here for when you’re ready."}
          </p>
          <Button onClick={onPlan}>
            Plan a date
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
                      recipe.request.currency,
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
  accountName,
  accountEmail,
  onAuth,
  onSave,
  onReset,
  membershipEnabled = false,
}: {
  request: PlanRequest;
  signedIn: boolean;
  accountName?: string | null;
  accountEmail?: string | null;
  onAuth: () => void;
  onSave: (preferences: StoredPreferences) => void;
  onReset: () => void;
  membershipEnabled?: boolean;
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
  const currency = preferences.currency ?? "NGN";
  const location = [preferences.city, preferences.area].filter(Boolean).join(", ");
  return (
    <main className={`${styles.page} ${styles.profile}`}>
      <header className={styles.header}>
        <div>
          <h1>Your profile</h1>
          <p>A few defaults to make your next date easier to plan.</p>
        </div>
        <Button type="button" variant="ghost" className={styles.accountButton} onClick={onAuth}>
          <Settings2 size={17} aria-hidden="true" />
          {signedIn ? "Manage account" : "Sign in or create account"}
        </Button>
      </header>
      <div className={styles.profileLayout}>
        <aside className={styles.summary} aria-labelledby="profile-summary-heading">
          <div className={styles.profileMark} aria-hidden="true"><UserRound size={24} strokeWidth={1.6} /></div>
          <h2 id="profile-summary-heading">{accountName || "Your planning defaults"}</h2>
          <p>{signedIn ? accountEmail || "Signed in" : "Not signed in"}</p>
          {membershipEnabled && <p><Link href="/membership">Your membership<ArrowRight size={14} aria-hidden="true" /></Link></p>}
          <dl>
            <div><dt>Starting point</dt><dd>{location || "Choose your usual city"}</dd></div>
            <div><dt>Budget</dt><dd>{preferences.budget == null ? "Open to suggestions" : `${money(preferences.budget, currency)}${preferences.budgetType === "per-person" ? " per person" : " total"}`}</dd></div>
            <div><dt>Atmosphere</dt><dd>{preferences.vibes?.length ? preferences.vibes.join(", ") : "Choose what you enjoy"}</dd></div>
          </dl>
          <p className={styles.summaryNote}>You can change these details for each new date. Saved dates keep their original answers.</p>
        </aside>
        <form
          className={styles.form}
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
          <fieldset className={styles.group}>
            <legend>Where you start</legend>
            <p className={styles.groupHint}>Your usual city and neighbourhood. You can plan somewhere else any time.</p>
            <div className={styles.fieldGrid}>
              <Field label="Country">
                <input autoComplete="country-name" maxLength={80} value={preferences.country ?? request.country} onChange={(event) => {
                  const country = event.target.value;
                  const nextCurrency = currencyForCountry(country);
                  setPreferences(previous => ({ ...previous, country, ...(nextCurrency ? { currency: nextCurrency, ...(nextCurrency !== (previous.currency ?? request.currency) ? { budget: null, transportBudget: null } : {}) } : {}) }));
                  setError("");
                }} />
              </Field>
              <Field label="City"><input autoComplete="address-level2" maxLength={80} value={preferences.city || ""} onChange={(event) => update("city", event.target.value)} /></Field>
              <Field label="Neighbourhood or area"><input maxLength={80} value={preferences.area || ""} onChange={(event) => update("area", event.target.value)} /></Field>
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>What feels comfortable to spend</legend>
            <p className={styles.groupHint}>Leave the amount blank to keep your budget open.</p>
            <div className={styles.fieldGrid}>
              <Field label="Currency"><select value={currency} onChange={(event) => { update("currency", event.target.value); update("budget", null); update("transportBudget", null); }}>{currencyOptions.map((option) => <option key={option}>{option}</option>)}</select></Field>
              <Field label={`Preferred budget (${currency})`} hint="Editing this amount sets a total budget for the date.">
                <input type="number" min={0} step={10 ** -currencyDigits(currency)} max={10000000} inputMode="decimal" value={preferences.budget ?? ""} onChange={(event) => {
                  update("budget", event.target.value ? Number(event.target.value) : null);
                  update("budgetType", "total");
                }} />
              </Field>
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>Your kind of date</legend>
            <p className={styles.groupHint}>Choose the moods you enjoy. Keep at least one selected.</p>
            <div className={styles.moods}>
              {vibes.map((vibe) => (
                <button key={vibe} type="button" className={styles.mood} aria-pressed={preferences.vibes?.includes(vibe) || false} onClick={() => update("vibes", preferences.vibes?.includes(vibe) ? preferences.vibes.filter((item) => item !== vibe) : [...(preferences.vibes || []), vibe])}>
                  {vibe}
                </button>
              ))}
            </div>
            <Field label="What do you enjoy?" hint="Activities, food, music or anything you would love to try."><textarea rows={3} maxLength={1000} value={preferences.interests || ""} onChange={(event) => update("interests", event.target.value)} /></Field>
            <Field label="Anything you would rather skip?"><input maxLength={500} value={preferences.dislikes || ""} onChange={(event) => update("dislikes", event.target.value)} /></Field>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>The practical details</legend>
            <Field label="Preferred setting"><select value={preferences.environment ?? "any"} onChange={(event) => update("environment", event.target.value === "indoor" ? "indoor" : event.target.value === "outdoor" ? "outdoor" : "any")}><option value="any">Indoors or outdoors</option><option value="indoor">Indoors</option><option value="outdoor">Outdoors</option></select></Field>
            <label className={styles.toggle}>
              <span><strong>Somewhere quiet enough to talk</strong><small>Prefer a quieter atmosphere.</small></span>
              <input type="checkbox" checked={preferences.quiet || false} onChange={(event) => update("quiet", event.target.checked)} />
            </label>
            <label className={styles.toggle}>
              <span><strong>A step-free entrance is essential</strong><small>Keep this requirement when looking for a place.</small></span>
              <input type="checkbox" checked={preferences.accessibility || false} onChange={(event) => update("accessibility", event.target.checked)} />
            </label>
            {!!preferences.dietary?.length && <details className={styles.legacyRequirements}>
              <summary>Previously saved food requirements</summary>
              <p>{preferences.dietary.join(", ")}</p>
              <button type="button" className={styles.textButton} onClick={() => update("dietary", [])}>Remove saved food requirements</button>
            </details>}
          </fieldset>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className={styles.formFooter}>
            <Button type="submit">Save preferences</Button>
            <p>Saved on this device for the next date you plan.</p>
          </div>
          <details className={styles.reset}>
            <summary>Clear saved preferences</summary>
            <p>This removes your defaults from this device. Your saved dates stay as they are.</p>
            <button type="button" className={styles.textButton} onClick={() => { onReset(); setPreferences({}); setError(""); }}>Clear preferences</button>
          </details>
        </form>
      </div>
    </main>
  );
}
