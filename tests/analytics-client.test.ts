import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { googleTagBootstrap, stopAnalytics, syncAnalytics, trackAnalyticsEvent } from "../lib/analytics/client";
import type { GoogleTag } from "../lib/analytics/policy";

test("the Google bootstrap queues genuine Arguments objects recognized by gtag.js", () => {
  const browser: { dataLayer?: unknown[]; gtag?: GoogleTag } = {};
  runInNewContext(googleTagBootstrap, { window: browser });
  assert.ok(browser.gtag);
  browser.gtag("consent", "default", { analytics_storage: "granted" });
  browser.gtag("event", "page_view", { page_location: "https://date-atlas.vercel.app/" });
  assert.equal(browser.dataLayer?.length, 2);
  for (const command of browser.dataLayer ?? []) {
    assert.equal(Object.prototype.toString.call(command), "[object Arguments]");
    assert.equal(Array.isArray(command), false);
  }
});

test("analytics starts automatically, ignores previous choices and preserves actions queued before the tag loads", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let storageReads = 0;
  const browser: { dataLayer?: unknown[]; gtag?: GoogleTag; location: { origin: string; pathname: string }; localStorage: { getItem: () => string } } = {
    location: { origin: "https://date-atlas.vercel.app", pathname: "/plan" },
    localStorage: { getItem: () => { storageReads++; return "declined"; } },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer: "" } });
  try {
    trackAnalyticsEvent("planner_started");
    syncAnalytics("G-GBKWTQBD2N", "/plan");
    const beforeBootstrap = browser.dataLayer;
    assert.equal(beforeBootstrap, undefined);
    runInNewContext(googleTagBootstrap, { window: browser });
    syncAnalytics("G-GBKWTQBD2N", "/plan");
    const events = Array.from(browser.dataLayer ?? []).flatMap((command) => typeof command === "object" && command !== null && "0" in command && command[0] === "event" && "1" in command ? [command[1]] : []);
    assert.deepEqual(events, ["page_view", "planner_started"]);
    assert.equal(storageReads, 0);
    const count = browser.dataLayer?.length;
    syncAnalytics("G-GBKWTQBD2N", "/plan");
    assert.equal(browser.dataLayer?.length, count);
  } finally {
    stopAnalytics();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});

test("a failing Google tag does not interrupt planning", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { referrer: "" };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "https://date-atlas.vercel.app", hostname: "date-atlas.vercel.app", pathname: "/plan" },
    gtag() { throw new Error("Tag blocked"); },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  try {
    assert.doesNotThrow(() => syncAnalytics("G-ABCDEFGHIJ", "/plan"));
    assert.doesNotThrow(() => trackAnalyticsEvent("planner_started"));
  } finally {
    stopAnalytics();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
