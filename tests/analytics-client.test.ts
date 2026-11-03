import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { getAnalyticsChoice, googleTagBootstrap, setAnalyticsChoice, syncAnalytics, trackAnalyticsEvent } from "../lib/analytics/client";
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

test("blocked storage, cookie access and a failing Google tag do not interrupt planning or withdrawal", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const storage = { getItem() { throw new Error("Storage blocked"); } };
  const document = { referrer: "" };
  Object.defineProperty(document, "cookie", { set() { throw new Error("Cookies blocked"); } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: storage,
    location: { origin: "https://date-atlas.vercel.app", hostname: "date-atlas.vercel.app", pathname: "/plan" },
    gtag() { throw new Error("Tag blocked"); },
    dispatchEvent() { return true; },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  try {
    assert.equal(getAnalyticsChoice(), null);
    assert.doesNotThrow(() => setAnalyticsChoice("accepted"));
    assert.equal(getAnalyticsChoice(), "accepted");
    assert.doesNotThrow(() => syncAnalytics("G-GBKWTQBD2N", true, "/plan"));
    assert.doesNotThrow(() => trackAnalyticsEvent("planner_started"));
    assert.doesNotThrow(() => setAnalyticsChoice("declined"));
    assert.equal(getAnalyticsChoice(), "declined");
    assert.doesNotThrow(() => trackAnalyticsEvent("planner_started"));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
