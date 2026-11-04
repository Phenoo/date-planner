"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { budgetSuggestions, currencyForCountry } from "@/lib/planner/currency";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Compass,
  ExternalLink,
  Heart,
  Info,
  LoaderCircle,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  occasions,
  experienceSchema,
  type Experience,
} from "@/lib/planner/schema";
import { money } from "@/lib/utils";
import { DateMap } from "./date-map";
import { Field } from "@/components/ui/field";

export const categories = [
  "All experiences",
  "Art & culture",
  "Food & dining",
  "Nature & outdoors",
  "Fun & games",
  "Unique experiences",
];
export function ExperienceCard({
  experience,
  onSelect,
  favorite = false,
  onFavorite,
  onAdd,
}: {
  favorite?: boolean;
  onFavorite?: (experience: Experience) => void;
  onAdd?: (experience: Experience) => void;
  experience: Experience;
  onSelect: (experience: Experience) => void;
}) {
  return (
    <article className="experience-card">
      <Link
        className="experience-open"
        href={`/experiences/${encodeURIComponent(experience.id)}`}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onSelect(experience);
        }}
        aria-label={`View ${experience.name}`}
      >
        <div className="experience-image">
          <Image
            src={experience.image}
            alt={`${experience.category} atmosphere — illustrative photography`}
            fill
            sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 32vw"
          />
          <span className="experience-category">{experience.category}</span>
          <span className="experience-arrow">
            <ArrowRight size={18} />
          </span>
          <span className="image-demo">
            {experience.demo ? "DEMO EXPERIENCE" : "ILLUSTRATIVE PHOTO"}
          </span>
        </div>
        <div className="experience-copy">
          <div className="experience-location">
            <MapPin size={12} />
            {experience.area}, {experience.city}
            <span>
              <Clock3 size={12} />
              {experience.duration} min
            </span>
          </div>
          <h3>{experience.name}</h3>
          <p>{experience.description}</p>
          <div className="experience-bottom">
            <div>
              <strong>{money(experience.price, experience.currency)}</strong>
              <span>
                {" "}
                / {experience.priceType === "per-person"
                  ? "person"
                  : "group"}{" "}
                <small>· estimated</small>
              </span>
            </div>
          </div>
        </div>
      </Link>
      <div className="experience-card-actions">
        {onFavorite && (
          <button
            className={`favorite-button ${favorite ? "is-favorite" : ""}`}
            onClick={() => onFavorite(experience)}
            aria-label={`${favorite ? "Unsave" : "Save"} ${experience.name}`}
            aria-pressed={favorite}
          >
            <Heart size={17} fill={favorite ? "currentColor" : "none"} />
          </button>
        )}
        {onAdd && (
          <button className="text-link" onClick={() => onAdd(experience)}>
            Add to my date <ArrowRight size={14} />
          </button>
        )}
      </div>
    </article>
  );
}
export function Explore({
  onBack,
  onPlan,
  initialCategory = "All experiences",
  onSelect,
  favorites = [],
  onFavorite,
  initialExperiences,
}: {
  favorites?: string[];
  onFavorite?: (experience: Experience) => void;
  onBack: () => void;
  onPlan: (experience?: Experience) => void;
  initialCategory?: string;
  initialExperiences?: Experience[];
  onSelect: (experience: Experience) => void;
}) {
  const [loadedExperiences, setExperiences] = useState<Experience[]>([]);
  const experiences = initialExperiences ?? loadedExperiences;
  const hasInitialExperiences = initialExperiences !== undefined;
  const [loading, setLoading] = useState(initialExperiences === undefined);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [destination, setDestination] = useState(() => ({ city: initialExperiences?.[0]?.city ?? "Lagos", country: initialExperiences?.[0]?.country ?? "Nigeria" }));
  const { city, country } = destination;
  const destinations = [...new Map(experiences.map((item) => [JSON.stringify([item.country, item.city]), { country: item.country, city: item.city }])).values()];
  const areas = [...new Set(experiences.filter((item) => item.city === city && item.country === country).map((item) => item.area))];
  const currency = currencyForCountry(country) ?? experiences.find((item) => item.city === city && item.country === country)?.currency ?? "NGN";
  const [area, setArea] = useState("All areas");
  const [budget, setBudget] = useState<number | null>(null);
  const [environment, setEnvironment] = useState("any");
  const [search, setSearch] = useState("");
  const [bookable, setBookable] = useState(false);
  const [duration, setDuration] = useState(720);
  const [display, setDisplay] = useState("list");
  const [occasion, setOccasion] = useState("");
  const [date, setDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    if (hasInitialExperiences) return;
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return experienceSchema.array().parse(data.experiences);
      })
      .then((items) => {
        if (controller.signal.aborted) return;
        setExperiences(items);
        setDestination((previous) => items.some((item) => item.city === previous.city && item.country === previous.country) || !items[0] ? previous : { city: items[0].city, country: items[0].country });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Couldn't load experiences.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [hasInitialExperiences]);
  const filtered = experiences.filter(
    (item) =>
      (category === "All experiences" || item.category === category) &&
      item.city === city && item.country === country &&
      (area === "All areas" || item.area === area) &&
      (budget === null || item.currency === currency && item.price <= budget) &&
      (environment === "any" || item.indoor === (environment === "indoor")) &&
      (!bookable || (!!item.bookingUrl && !item.demo)) &&
      item.duration <= duration &&
      (!occasion || item.occasions.includes(occasion)) &&
      (!date ||
        item.hours.some(
          (hours) =>
            hours.day === new Date(`${date}T12:00:00Z`).getUTCDay() &&
            hours.close - hours.open >= item.duration,
        )) &&
      `${item.name} ${item.description} ${item.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main className="explore-page page-container">
      <button className="text-link back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        Back to inspiration
      </button>
      <div className="results-heading">
        <div>
          <span className="eyebrow">GOOD TIMES ARE CLOSER THAN YOU THINK</span>
          <h1>The best moments are waiting to happen.</h1>
          <p>Explore places and experiences worth sharing.</p>
        </div>
        <Button onClick={() => onPlan()}>
          <Sparkles size={16} />
          Plan my date
        </Button>
      </div>
      <div className="data-notice">
        <Info size={16} />
        <span>
          Venue prices and hours carry source and review dates. Photos illustrate the
          atmosphere. Check the source for special closures and current availability.
        </span>
      </div>
      <div className="explore-search">
        <Search size={18} />
        <input
          aria-label="Search experiences"
          placeholder="What are you in the mood for?"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Filter by city"
          value={JSON.stringify([country, city])}
          onChange={(event) => {
            const selected = destinations.find((item) => JSON.stringify([item.country, item.city]) === event.target.value);
            if (selected) setDestination(selected);
            setArea("All areas");
            setBudget(null);
          }}
        >
          {destinations.map((item) => (
            <option key={JSON.stringify([item.country, item.city])} value={JSON.stringify([item.country, item.city])}>{item.city}, {item.country}</option>
          ))}
        </select>
        <Button
          size="small"
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={15} />
          Filters
        </Button>
      </div>
      {showFilters && (
        <div className="explore-filters">
          <Field label="Neighborhood">
            <select
              value={area}
              onChange={(event) => setArea(event.target.value)}
            >
              <option>All areas</option>
              {areas.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Max activity price"
            hint="Per person or group as shown on each card."
          >
            <select
              value={budget ?? ""}
              onChange={(event) => setBudget(event.target.value === "" ? null : Number(event.target.value))}
            >
              <option value="">Any price</option><option value="0">Free admission</option>
              {budgetSuggestions(currency).map((amount) => (
                <option key={amount} value={amount}>
                  {money(amount, currency)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Setting">
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="any">Any setting</option>
              <option value="indoor">Indoors</option>
              <option value="outdoor">Outdoors</option>
            </select>
          </Field>
          <Field label="Max activity duration">
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            >
              <option value={720}>Any duration</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </Field>
          <Field label="Occasion">
            <select
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
            >
              <option value="">Any occasion</option>
              {occasions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Date"
            hint="Checks catalog opening hours, not live availability."
          >
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={bookable}
              onChange={(event) => setBookable(event.target.checked)}
            />
            <span>Bookable only</span>
          </label>
        </div>
      )}
      <div className="category-tabs">
        {categories.map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading-state">
          <LoaderCircle size={28} className="spin" />
          <p>Finding lovely possibilities…</p>
        </div>
      ) : error ? (
        <div className="empty-small">
          <Info size={25} />
          <p role="alert">{error}</p>
          <Button variant="outline" onClick={onBack}>
            Back to home
          </Button>
        </div>
      ) : !filtered.length ? (
        <div className="empty-small">
          <Compass size={36} strokeWidth={1} />
          <h2>A little more room to explore?</h2>
          <p>
            No catalog experiences match these filters. Try a different area,
            budget, or category.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setArea("All areas");
              setCategory("All experiences");
              setBudget(null);
              setEnvironment("any");
              setSearch("");
              setBookable(false);
              setDuration(720);
              setOccasion("");
              setDate("");
            }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <>
          <div className="results-count">
            <span>{filtered.length} possibilities for your next date</span>
            <div className="segmented-control">
              {["list", "map"].map((mode) => (
                <button
                  key={mode}
                  className={display === mode ? "active" : ""}
                  aria-pressed={display === mode}
                  onClick={() => setDisplay(mode)}
                >
                  {mode === "list" ? "List" : "Map"}
                </button>
              ))}
            </div>
          </div>
          {display === "map" ? (
            <div className="discovery-map">
              <div className="discovery-map-list">
                {filtered.map((item, index) => (
                  <button key={item.id} onClick={() => onSelect(item)}>
                    <span className="mini-label">
                      {index + 1} · {item.area} ·{" "}
                      {item.demo ? "Demo" : "Catalog experience"}
                    </span>
                    <h3>{item.name}</h3>
                    <p>
                      {item.duration} minutes · {money(item.price, item.currency)} estimated{" "}
                      {item.priceType === "per-person"
                        ? "per person"
                        : "per group"}
                    </p>
                  </button>
                ))}
              </div>
              <DateMap
                experiences={filtered}
                onSelect={onSelect}
                route={false}
              />
            </div>
          ) : (
            <div className="experience-grid">
              {filtered.map((item) => (
                <ExperienceCard
                  key={item.id}
                  experience={item}
                  onSelect={onSelect}
                  favorite={favorites.includes(item.id)}
                  onFavorite={onFavorite}
                  onAdd={onPlan}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
export function ExperienceDetails({
  experience,
  onClose,
  onPlan,
}: {
  experience: Experience | null;
  onClose: () => void;
  onPlan: (experience: Experience) => void;
}) {
  if (!experience) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={experience.name}
      className="experience-dialog"
    >
      <div className="detail-photo">
        <Image
          src={experience.image}
          alt="Illustrative experience photography"
          fill
          sizes="700px"
        />
        <span className="image-demo">ILLUSTRATIVE PHOTOGRAPHY</span>
      </div>
      <div className="detail-content">
        <span className="eyebrow">{experience.category}</span>
        <h2>{experience.name}</h2>
        <p className="venue-name">
          <MapPin size={14} />
          {experience.venue} · {experience.area}, {experience.city}
        </p>
        <p>{experience.description}</p>
        <div className="detail-meta">
          <span>
            <Clock3 size={17} />
            {experience.duration} minutes
          </span>
          <span>{experience.indoor ? "Indoors" : "Outdoors"}</span>
          <span>
            {experience.quiet ? "Conversation-friendly" : "Lively atmosphere"}
          </span>
        </div>
        <div className="detail-pricing">
          <strong>
            {money(experience.price, experience.currency)}{" "}
            <small>
              / {experience.priceType === "per-person" ? "person" : "group"}{" "}
              estimated
            </small>
          </strong>
          <span>
            {experience.verifiedAt
              ? `Last verified ${experience.verifiedAt}`
              : "Sample pricing · not verified"}
          </span>
        </div>
        <div className="pill-group">
          {experience.vibes.map((vibe) => (
            <span className="tag" key={vibe}>
              {vibe}
            </span>
          ))}
        </div>
        <p className="detail-booking">
          <Info size={16} />
          {experience.reservation}
        </p>
        {experience.demo && (
          <div className="data-notice">
            This fictional record is for testing the planner. There is no
            real-world venue or booking availability.
          </div>
        )}
        <Button onClick={() => onPlan(experience)}>
          <Sparkles size={16} />
          Add to my date plan
          <ArrowRight size={16} />
        </Button>
        {!experience.demo && experience.bookingUrl && (
          <Button asChild variant="outline">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={experience.bookingUrl}
            >
              View booking options
              <ExternalLink size={15} />
            </a>
          </Button>
        )}
      </div>
    </Dialog>
  );
}
