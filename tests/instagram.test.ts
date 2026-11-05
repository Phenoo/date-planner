import test from "node:test";
import assert from "node:assert/strict";
import { instagramProfileUrl } from "../lib/maps/instagram";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("only explicit Instagram profile URLs are canonicalized without guessing handles", () => {
  assert.equal(instagramProfileUrl("https://instagram.com/Venue.Name_1"), "https://www.instagram.com/venue.name_1/");
  assert.equal(instagramProfileUrl("https://www.instagram.com/fixture.gallery/?hl=en#photos"), "https://www.instagram.com/fixture.gallery/");
  assert.equal(instagramProfileUrl("https://www.instagram.com/a/"), "https://www.instagram.com/a/");
  for (const input of [undefined, "", "venue.name", "@venue.name", "https://venue.example/", "https://venue.example/?instagram=venue.name"]) assert.equal(instagramProfileUrl(input), undefined);
});

test("Instagram links cannot use lookalike hosts, insecure schemes or credentials", () => {
  for (const input of [
    "http://www.instagram.com/venue/", "javascript:alert(1)", "https://instagram.com.evil.test/venue/",
    "https://evilinstagram.com/venue/", "https://m.instagram.com/venue/", "https://instagram.com@evil.test/venue/",
    "https://user@www.instagram.com/venue/", "https://user:password@instagram.com/venue/", "https://www.instagram.com:444/venue/",
  ]) assert.equal(instagramProfileUrl(input), undefined, input);
});

test("post, reel, story, login and system links never become guessed profile previews", () => {
  for (const path of ["p/shortcode/", "reel/shortcode/", "reels/", "stories/venue/123/", "accounts/login/", "accounts/", "login", "explore/", "direct/", "privacy", "oauth", ""]) {
    assert.equal(instagramProfileUrl(`https://www.instagram.com/${path}`), undefined, path);
  }
});

test("Instagram profile names are bounded and cannot contain extra or encoded path segments", () => {
  for (const path of ["venue/photos/", "venue%2Fother/", "venue%3Fredirect/", "%76enue/", ".venue/", "venue./", "venue..name/", "venue-name/", `${"a".repeat(31)}/`]) {
    assert.equal(instagramProfileUrl(`https://www.instagram.com/${path}`), undefined, path);
  }
  assert.equal(instagramProfileUrl(`https://instagram.com/${"a".repeat(30)}/`), `https://www.instagram.com/${"a".repeat(30)}/`);
});

test("Instagram preview initially shows only a safe external link and an explicit load control", async () => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "instagram-test-"));
  try {
    const output = join(directory, "instagram.mjs");
    await build({ entryPoints: ["components/date-atlas/venue-instagram.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", alias: { "next/script": "next/script.js" }, loader: { ".css": "empty" }, jsx: "automatic", logLevel: "silent" });
    const { VenueInstagram }: { VenueInstagram: ComponentType<{ url: string }> } = await import(pathToFileURL(output).href);
    const html = renderToStaticMarkup(createElement(VenueInstagram, { url: "https://instagram.com/Venue.Name/?hl=en" }));
    assert.ok(html.includes('href="https://www.instagram.com/venue.name/"'));
    assert.ok(html.includes("View profile"));
    assert.ok(html.includes("Show Instagram preview"));
    assert.ok(html.includes('aria-expanded="false"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(!html.includes("embed.js"));
    assert.ok(!html.includes("<iframe"));
    assert.ok(!html.includes("<blockquote"));
    assert.equal(renderToStaticMarkup(createElement(VenueInstagram, { url: "https://not-instagram.example/venue" })), "");
    assert.equal(renderToStaticMarkup(createElement(VenueInstagram, { url: "https://instagram.com/p/post-id/" })), "");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
