"use client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  Heart,
  Info,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateMap } from "./date-map";
import { ExperienceCard } from "./explore";
import type { Experience } from "@/lib/planner/schema";
import { formatTime, money } from "@/lib/utils";

export function ExperiencePage({
  experience,
  catalog,
  favorite,
  favorites,
  onFavorite,
  onAdd,
  onSelect,
  loading,
}: {
  experience?: Experience;
  catalog: Experience[];
  favorite: boolean;
  favorites: string[];
  onFavorite: (experience: Experience) => void;
  onAdd: (experience: Experience) => void;
  onSelect: (experience: Experience) => void;
  loading: boolean;
}) {
  if (loading)
    return (
      <main className="loading-state" role="status">
        Finding that little possibility…
      </main>
    );
  if (!experience)
    return (
      <main className="empty-state page-container">
        <h1>This experience isn&apos;t here.</h1>
        <p>
          It may have left our current collection. Find another possibility for
          your date.
        </p>
        <Button asChild>
          <Link href="/explore">Explore experiences</Link>
        </Button>
      </main>
    );
  const related = catalog
    .filter(
      (item) =>
        item.id !== experience.id &&
        (item.area === experience.area ||
          item.category === experience.category),
    )
    .slice(0, 3);
  return (
    <main className="experience-page page-container">
      <Link href="/explore" className="text-link back-link">
        <ArrowLeft size={14} />
        All experiences
      </Link>
      <div className="experience-page-hero">
        <Image
          src={experience.image}
          alt="Illustrative experience atmosphere; not a photo of the demo venue"
          fill
          sizes="(max-width:700px) 100vw, 90vw"
          loading="eager"
        />
        <div className="cover-shade" />
        <div className="experience-page-title">
          <span className="tag">{experience.category}</span>
          <h1>{experience.name}</h1>
          <p>
            <MapPin size={14} />
            {experience.area}, {experience.city}
          </p>
        </div>
        <button
          className={`favorite-button ${favorite ? "is-favorite" : ""}`}
          onClick={() => onFavorite(experience)}
          aria-pressed={favorite}
          aria-label={`${favorite ? "Unsave" : "Save"} ${experience.name}`}
        >
          <Heart size={19} fill={favorite ? "currentColor" : "none"} />
        </button>
        <span className="photo-caption">
          Illustrative photography
          {experience.demo ? " · Fictional demo experience" : ""}
        </span>
      </div>
      <div className="experience-detail-layout">
        <div>
          <span className="eyebrow">
            A LITTLE MORE ABOUT YOUR NEXT GOOD DAY
          </span>
          <h2>Something worth sharing.</h2>
          <p>{experience.description}</p>
          <div className="detail-meta">
            <span>
              <Clock3 size={16} />
              {experience.duration} minutes
            </span>
            <span>{experience.indoor ? "Indoors" : "Outdoors"}</span>
            <span>
              {experience.quiet ? "Conversation-friendly" : "Lively atmosphere"}
            </span>
            <span>Up to {experience.maxGuests} guests</span>
          </div>
          <section>
            <h3>The setting</h3>
            <p>
              {experience.venue} · {experience.area}, {experience.city},{" "}
              {experience.country}
            </p>
            <p>
              {experience.accessible === true
                ? "Step-free access is recorded in this catalog."
                : experience.accessible === false
                  ? "This record does not support a step-free access requirement."
                  : "Accessibility has not been verified. Confirm directly before visiting."}
            </p>
            <div className="pill-group">
              {experience.vibes.map((vibe) => (
                <span key={vibe} className="tag">
                  {vibe}
                </span>
              ))}
            </div>
          </section>
          <section>
            <h3>A reason to celebrate</h3>
            <div className="pill-group">
              {experience.occasions.map((occasion) => (
                <span key={occasion} className="tag">
                  {occasion}
                </span>
              ))}
            </div>
          </section>
          <section>
            <h3>Before you go</h3>
            <p>{experience.reservation}</p>
            <p>
              {experience.dietary.length
                ? `Catalog food options: ${experience.dietary.join(", ")}. Confirm specific requirements with the provider.`
                : "No dietary information is recorded."}
            </p>
            <details className="flow-details">
              <summary>Catalog opening hours</summary>
              <div className="opening-hours">
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((day, index) => (
                  <div key={day}>
                    <span>{day}</span>
                    <span>
                      {experience.hours
                        .filter((hours) => hours.day === index)
                        .map(
                          (hours) =>
                            `${formatTime(hours.open)}–${formatTime(hours.close)}`,
                        )
                        .join(", ") || "Closed"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </section>
          <DateMap experiences={[experience]} route={false} />
        </div>
        <aside>
          <div className="booking-summary">
            <span className="mini-label">A LITTLE PLAN STARTS HERE</span>
            <div className="detail-price">
              {money(experience.price)}
              <span>
                {" "}
                / {experience.priceType === "per-person"
                  ? "person"
                  : "group"}{" "}
                estimated
              </span>
            </div>
            <p>
              {experience.verifiedAt
                ? `Information last verified ${experience.verifiedAt}`
                : "Sample price. Not verified in the real world."}
            </p>
            <div className="data-notice">
              <Info size={16} />
              {experience.demo
                ? "This is a fictional demonstration record. It cannot be reserved or paid for."
                : "Confirm current prices and availability with the provider. Adding an experience does not reserve it."}
            </div>
            <Button onClick={() => onAdd(experience)}>
              Add to My Date
              <ArrowRight size={16} />
            </Button>
            <p className="booking-included">
              <Check size={14} />
              We check the complete itinerary against your budget and schedule.
            </p>
            {experience.bookingUrl && !experience.demo && (
              <Button asChild variant="outline">
                <a
                  href={experience.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book with provider
                  <ExternalLink size={14} />
                </a>
              </Button>
            )}
            <small>No reservation or payment has been made.</small>
          </div>
        </aside>
      </div>
      {!!related.length && (
        <section className="section-space">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MORE WAYS TOGETHER</span>
              <h2>A few more possibilities.</h2>
            </div>
          </div>
          <div className="experience-grid">
            {related.map((item) => (
              <ExperienceCard
                key={item.id}
                experience={item}
                onSelect={onSelect}
                favorite={favorites.includes(item.id)}
                onFavorite={onFavorite}
                onAdd={onAdd}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
