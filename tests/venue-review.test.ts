import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NearbyResult } from "../lib/maps/schema";

test("the reveal review renders only the current venue's attributed provider review", async () => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "review-test-"));
  try {
    const output = join(directory, "review.mjs");
    await build({ entryPoints: ["components/date-atlas/venue-review.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "silent" });
    type Place = NearbyResult["places"][number];
    const { VenueReview }: { VenueReview: ComponentType<{ place: Place }> } = await import(pathToFileURL(output).href);
    const place: Place = { id: "venue-a", name: "Venue A", category: "Gallery", address: "Fixture", distanceKm: 1, reason: "Fixture", mapsUrl: "https://maps.google.com/?query_place_id=venue-a", attributions: [], details: { checkedAt: "2026-11-02T00:00:00Z", opening: "unknown", hours: [], travelMinutes: 10, reviews: [{ author: "Visitor A", text: "Review belonging to venue A.", rating: 4, url: "https://maps.google.com/visitor-a", when: "A week ago" }] } };
    const markup = renderToStaticMarkup(createElement(VenueReview, { place }));
    for (const value of ["Venue A", "Visitor A", "Review belonging to venue A.", "4 / 5", "A week ago", "https://maps.google.com/visitor-a", "query_place_id=venue-a", "Google Maps"]) assert.ok(markup.includes(value));
    assert.equal(renderToStaticMarkup(createElement(VenueReview, { place: { ...place, id: "venue-b", name: "Venue B", details: undefined } })), "", "Changing to a venue without reviews cannot retain the previous venue's review");
    assert.equal(renderToStaticMarkup(createElement(VenueReview, { place: { ...place, details: { ...place.details!, reviews: [{ author: "Empty", text: "  " }] } } })), "");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
