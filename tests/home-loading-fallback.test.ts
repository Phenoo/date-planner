import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

test("the homepage streams the branded red loader before stored onboarding state is available", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "home-loading-test-"));
  const fixtures: Record<string, string> = {
    "next/navigation": "export const useSearchParams = () => new URLSearchParams();",
    "./date-atlas": "export const DateAtlas = () => null;",
    "./preloader": 'import { createElement } from "react"; export const Preloader = () => createElement("main", { "data-welcome-introduction": true });',
    "./saved-dates-access": "export const observeSavedDatesAccess = () => () => {};",
  };
  try {
    const output = join(directory, "home.mjs");
    await build({
      stdin: { contents: 'export { HomeEntry, HomeEntryFallback } from "./components/date-atlas/home-entry";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", logLevel: "silent",
      plugins: [{ name: "home-loading-services", setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(fixtures, path) ? { path, namespace: "home-loading" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "home-loading" }, ({ path }) => ({ contents: fixtures[path], loader: "js", resolveDir: process.cwd() }));
        builder.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
      } }],
    });
    const fixture: { HomeEntry: ComponentType; HomeEntryFallback: ComponentType } = await import(pathToFileURL(output).href);
    await t.test("the route fallback does not render the white first-visit introduction", () => {
      const html = renderToStaticMarkup(createElement(fixture.HomeEntryFallback));
      assert.match(html, /data-planner-theme="red"/);
      assert.match(html, /aria-busy="true"/);
      assert.match(html, /<svg/);
      assert.match(html, /Something lovely\./);
      assert.doesNotMatch(html, /data-welcome-introduction/);
    });
    await t.test("the server snapshot of returning visitors uses that same loader", () => {
      const html = renderToStaticMarkup(createElement(fixture.HomeEntry));
      assert.equal(html, renderToStaticMarkup(createElement(fixture.HomeEntryFallback)));
      assert.doesNotMatch(html, /data-welcome-introduction/);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
