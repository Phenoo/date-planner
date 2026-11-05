import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackDateStory } from "../lib/planner/date-story";
import type { ChosenDate } from "../lib/planner/invitations";

test("saved date cards disclose management actions without exposing private invitation links", async () => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "date-actions-test-"));
  try {
    const output = join(directory, "actions.mjs");
    await build({ entryPoints: ["components/date-atlas/date-actions.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", alias: { "next/link": "next/link.js", "next/image": "next/image.js" }, loader: { ".css": "empty" }, jsx: "automatic", logLevel: "silent" });
    type Props = { date: ChosenDate; disabled: boolean; completing: boolean; onComplete: () => void; onRevoked: () => void; onChanged: () => void };
    const { DateActions }: { DateActions: ComponentType<Props> } = await import(pathToFileURL(output).href);
    const date: ChosenDate = { id: "a".repeat(64), token: "private-token".padEnd(32, "x"), title: "Gallery together", place: null, placeId: "fixture", source: "google", story: fallbackDateStory("gallery"), response: "pending", dateStatus: "planned", createdAt: "2026-11-05T00:00:00Z", invitationPublished: true, invitationRevoked: false, canEdit: true, timeZone: "Africa/Lagos", date: "2026-11-09", startTime: "18:00", duration: 180, datePreference: "weekday", city: "Lagos", country: "Nigeria" };
    const render = (selection: ChosenDate) => renderToStaticMarkup(createElement(DateActions, { date: selection, disabled: false, completing: false, onComplete() {}, onRevoked() {}, onChanged() {} }));
    const published = render(date);
    const disclosure = published.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    assert.ok(disclosure);
    assert.doesNotMatch(disclosure, /<details\b[^>]*\bopen(?:=|[\s>])/);
    assert.match(disclosure, /More options for Gallery together/);
    for (const action of ["Rename", "Edit or reschedule", "Mark as done", "Add to calendar", "Leave feedback", "View invitation", "Revoke invitation link", "Share invitation", "Copy link", "WhatsApp", "Delete date"]) assert.ok(disclosure.includes(action), `${action} remains available in More options`);
    const outside = published.replace(disclosure, "");
    assert.equal((outside.match(/<button\b/g) ?? []).length, 1);
    assert.match(outside, /Open date/);
    for (const selection of [{ ...date, invitationPublished: false }, { ...date, invitationRevoked: true }]) {
      const markup = render(selection);
      assert.ok(!markup.includes(date.token), "A private or revoked date must not expose an invitation URL");
      assert.match(markup, /Create invitation/);
    }
    const completed = render({ ...date, dateStatus: "completed" });
    assert.doesNotMatch(completed, /Mark as done|Edit or reschedule/);
    assert.match(completed, /Leave feedback/);
    assert.match(completed, /Delete date/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
