import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicInvitation } from "../lib/planner/invitations";

test("chosen venue keeps source attribution when the Maps action is hidden", async () => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "venue-attribution-test-"));
  try {
    const output = join(directory, "card.mjs");
    await build({ entryPoints: ["components/date-atlas/chosen-place-card.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, jsx: "automatic", logLevel: "silent", plugins: [{ name: "venue-image-fixture", setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: "react", external: true }));
      builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "next/image", namespace: "image-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "image-fixture" }, () => ({ contents: 'import { createElement } from "react"; export default ({ src, alt }) => createElement("img", { src, alt });', loader: "js" }));
    } }] });
    type Props = { place: PublicInvitation["place"]; placeId: string; showMapLink?: boolean; catalog?: boolean };
    const { ChosenPlaceCard }: { ChosenPlaceCard: ComponentType<Props> } = await import(pathToFileURL(output).href);
    const photo = { url: "https://example.googleusercontent.com/photo", sourceUrl: "https://www.google.com/maps/photo/fixture", authors: [{ name: "Venue photographer", url: "https://www.google.com/maps/contrib/fixture" }] };
    const place: NonNullable<PublicInvitation["place"]> = { id: "fixture", name: "A quiet garden", address: "Lagos", category: "Garden", mapsUrl: "https://www.google.com/maps/search/?api=1&query_place_id=fixture", attributions: [], photo };
    const render = (props: Partial<Props> = {}) => renderToStaticMarkup(createElement(ChosenPlaceCard, { place, placeId: place.id, showMapLink: false, ...props }));
    const withPhoto = render();
    assert.match(withPhoto, /href="https:\/\/www\.google\.com\/maps\/photo\/fixture"[^>]*translate="no">Google Maps<\/a>/);
    assert.match(withPhoto, /Photo: Venue photographer/);
    assert.doesNotMatch(withPhoto, /View on Google Maps/);
    assert.match(render({ place: { ...place, photo: { ...photo, authors: [] } } }), /translate="no">Google Maps<\/a>/);
    const withoutPhoto = render({ place: { ...place, photo: undefined } });
    assert.match(withoutPhoto, /query_place_id=fixture[^>]*translate="no">Google Maps<\/a>/);
    assert.doesNotMatch(withoutPhoto, /View on Google Maps/);
    assert.doesNotMatch(render({ catalog: true }), /translate="no">Google Maps<\/a>/);
    assert.doesNotMatch(render({ place: null }), /translate="no">Google Maps<\/a>/);
    assert.match(render({ showMapLink: true }), /View on Google Maps/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
