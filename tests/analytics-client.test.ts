import { test } from "node:test";
import assert from "node:assert/strict";
import { getAnalyticsChoice, setAnalyticsChoice, syncAnalytics, trackAnalyticsEvent } from "../lib/analytics/client";

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
