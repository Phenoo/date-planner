"use client";
import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import type { Experience } from "@/lib/planner/schema";
import { directionsUrl, embedMapUrl } from "@/lib/maps/urls";

export function DateMap({
  experiences,
  onSelect,
  route = true,
  walking = false,
}: {
  experiences: Experience[];
  onSelect?: (experience: Experience) => void;
  route?: boolean;
  walking?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!experiences.length)
    return <div className="map-empty">No locations match these filters.</div>;
  const lat = experiences.map((item) => item.lat);
  const lng = experiences.map((item) => item.lng);
  const lowLat = Math.min(...lat),
    highLat = Math.max(...lat),
    lowLng = Math.min(...lng),
    highLng = Math.max(...lng);
  const points = experiences.map((item) => ({
    x:
      highLng === lowLng
        ? 170
        : 40 + ((item.lng - lowLng) / (highLng - lowLng)) * 260,
    y:
      highLat === lowLat
        ? 105
        : 170 - ((item.lat - lowLat) / (highLat - lowLat)) * 130,
    item,
  }));
  const item = experiences.find((item) => item.id === selected);
  const demo = experiences.some((item) => item.demo);
  const embed = embedMapUrl(
    experiences,
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY,
    route,
    walking,
  );
  const directions = directionsUrl(experiences, walking);
  return (
    <div className="date-map">
      <div className="map-heading">
        <span>
          <MapPin size={15} />
          {route ? "Your day, connected" : "Find your kind of place"}
        </span>
        <small>{demo ? "DEMO" : embed ? "GOOGLE MAPS" : "LOCATIONS"}</small>
      </div>
      {embed ? (
        <iframe
          title="Your date locations on Google Maps"
          src={embed}
          width="100%"
          height="280"
          style={{ border: 0, minHeight: 220 }}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <svg
          viewBox="0 0 340 215"
          role="img"
          aria-label="Schematic location preview based on catalog coordinates. This is not a road map."
        >
          <rect width="340" height="215" fill="#fff1f3" />
          {[40, 90, 140, 190, 240, 290].map((x) => (
            <path
              key={x}
              d={`M ${x} 0 L ${x + 24} 215`}
              stroke="#fff"
              strokeWidth="12"
            />
          ))}
          {[40, 105, 175].map((y) => (
            <path
              key={y}
              d={`M 0 ${y} L 340 ${y - 15}`}
              stroke="#fff"
              strokeWidth="9"
            />
          ))}
          {route && (
            <polyline
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#261014"
              strokeWidth="2"
              strokeDasharray="4 5"
            />
          )}
          {points.map(({ x, y, item }, index) => (
            <g key={item.id} transform={`translate(${x},${y})`}>
              <circle
                r="15"
                fill={item.id === selected ? "#261014" : "#d91335"}
                stroke="white"
                strokeWidth="3"
              />
              <text
                textAnchor="middle"
                y="5"
                fontSize="12"
                fontFamily="sans-serif"
                fontWeight="700"
                fill="white"
              >
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      )}
      <div className="map-legend">
        {experiences.map((experience, index) => (
          <button
            key={experience.id}
            onClick={() => {
              setSelected(experience.id);
              onSelect?.(experience);
            }}
            aria-pressed={selected === experience.id}
          >
            <span>{index + 1}</span>
            {experience.name}
          </button>
        ))}
      </div>
      {item && !item.demo && (
        <a
          className="text-link"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`}
        >
          Get directions
          <ExternalLink size={13} />
        </a>
      )}
      {route && directions && (
        <a
          className="text-link"
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open full route in Google Maps <ExternalLink size={13} />
        </a>
      )}
      <p className="map-disclaimer">
        {demo
          ? "Illustrative demo coordinates. Fictional venues cannot be visited."
          : embed
            ? "Google Maps shows your stops. Itinerary times and transport costs remain estimates."
            : "Map preview unavailable. Open Google Maps for directions."}{" "}
        {demo && route ? "Connections show stop order, not road routes. " : ""}
        The itinerary does not use live traffic.
      </p>
    </div>
  );
}
