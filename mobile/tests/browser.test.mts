import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { browserScript, readBrowserMessage } from "../src/browser-bridge.ts";
import { externalLink, getWebOrigin, isCheckout, readGoogleSignInReturn, readUrl } from "../src/web-origin.ts";

test("a mobile release uses HTTPS and development can use a loopback site", () => {
  assert.equal(getWebOrigin(undefined, false), "https://adateatlas.com");
  assert.equal(getWebOrigin("http://127.0.0.1:3004", true), "http://127.0.0.1:3004");
  assert.throws(() => getWebOrigin("http://127.0.0.1:3004", false));
  assert.throws(() => getWebOrigin("http://adateatlas.com", true));
  assert.equal(readUrl("https://adateatlas.com@other.example/"), null);
});

test("Google cannot escape to a browser-only login and checkout only permits the existing providers", () => {
  assert.equal(externalLink(new URL("https://accounts.google.com/o/oauth2/auth")), null);
  assert.equal(externalLink(new URL("javascript:void(0)")), null);
  assert.equal(isCheckout(new URL("https://checkout.paystack.com/key")), true);
  assert.equal(isCheckout(new URL("https://paystack.com.other.example/key")), false);
});

test("the native bridge accepts the website palette and calendar, and ignores other payloads", () => {
  assert.deepEqual(readBrowserMessage('{"type":"surface","color":"rgb(217, 19, 53)"}'), {
    type: "surface", surface: { color: "rgb(217,19,53)", dark: true, chat: false },
  });
  assert.equal(readBrowserMessage('{"type":"surface","color":"rgb(999, 19, 53)"}'), null);
  assert.equal(readBrowserMessage('{"type":"calendar","id":"1:1","calendar":"ordinary text"}'), null);
  assert.equal(readBrowserMessage('{"type":"calendar","id":"1:1","calendar":"BEGIN:VCALENDAR\\r\\nEND:VCALENDAR\\r\\n"}')?.type, "calendar");
});

test("the status bar follows a white welcome screen covering the red page background", () => {
  const root = { backgroundColor: "rgb(217, 19, 53)" };
  const intro = { backgroundColor: "rgb(255, 255, 255)", parentElement: root, closest: () => null };
  const messages: string[] = [];
  const frames: (() => void)[] = [];
  runInNewContext(browserScript("https://adateatlas.com"), {
    location: { origin: "https://adateatlas.com" },
    window: { ReactNativeWebView: { postMessage: (message: string) => messages.push(message) }, addEventListener() {}, dispatchEvent() {} },
    Event,
    navigator: {},
    HTMLAnchorElement: class {},
    document: { documentElement: root, elementFromPoint: () => intro, addEventListener() {} },
    MutationObserver: class { observe() {} },
    addEventListener() {},
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    getComputedStyle: (node: typeof root) => node,
  });
  frames[0]();
  assert.deepEqual(readBrowserMessage(messages[0]), { type: "surface", surface: { color: "rgb(255,255,255)", dark: false, chat: false } });
});

test("Google callbacks must match the app scheme, route and initiating session", () => {
  const session = "a".repeat(64);
  const code = "c".repeat(64);
  assert.equal(readGoogleSignInReturn(`adateatlas://auth/google?session=${session}&code=${code}`, session), code);
  for (const value of [
    `other://auth/google?session=${session}&code=${code}`,
    `https://adateatlas.com/auth/google?session=${session}&code=${code}`,
    `adateatlas://auth/other?session=${session}&code=${code}`,
    `adateatlas://auth/google?session=${"b".repeat(64)}&code=${code}`,
    `adateatlas://user:password@auth/google?session=${session}&code=${code}`,
    `adateatlas://auth/google?session=${session}`,
    `adateatlas://auth/google?session=${session}&code=invalid`,
  ]) assert.equal(readGoogleSignInReturn(value, session), null);
  assert.equal(readBrowserMessage(JSON.stringify({ type: "google", id: "1:1", sessionId: session }))?.type, "google");
  assert.equal(readBrowserMessage(JSON.stringify({ type: "google", id: "1:1", sessionId: "invalid" })), null);
});

test("the bridge reports chat transitions even when the page colour does not change", () => {
  let chat = false;
  const root = { backgroundColor: "rgb(217, 19, 53)" };
  const node = { ...root, closest: () => chat ? {} : null };
  const messages: string[] = [];
  const frames: (() => void)[] = [];
  let update: () => void = () => {};
  runInNewContext(browserScript("https://adateatlas.com"), {
    location: { origin: "https://adateatlas.com" },
    window: { ReactNativeWebView: { postMessage: (message: string) => messages.push(message) }, addEventListener() {}, dispatchEvent() {} },
    navigator: {}, HTMLAnchorElement: class {}, Event,
    document: { documentElement: root, elementFromPoint: () => node, addEventListener() {} },
    MutationObserver: class { constructor(callback: () => void) { update = callback; } observe() {} },
    addEventListener() {}, requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; },
    getComputedStyle: (element: typeof root) => element,
  });
  frames.shift()?.();
  chat = true; update(); frames.shift()?.();
  chat = false; update(); frames.shift()?.();
  assert.deepEqual(messages.map(raw => { const message = readBrowserMessage(raw); return message?.type === "surface" ? message.surface.chat : null; }), [false, true, false]);
});

test("Google sign-in reports success and cancellation back to the initiating web request", async () => {
  const messages: string[] = [];
  const window = Object.assign(new EventTarget(), { ReactNativeWebView: { postMessage: (message: string) => messages.push(message) } });
  runInNewContext(browserScript("https://adateatlas.com"), {
    location: { origin: "https://adateatlas.com" }, window,
    navigator: {}, HTMLAnchorElement: class {}, Event, CustomEvent, DOMException,
    document: { documentElement: {}, elementFromPoint: () => null, addEventListener() {} },
    MutationObserver: class { observe() {} }, addEventListener() {}, requestAnimationFrame() {},
  });
  const sessionId = "a".repeat(64);
  const results: unknown[] = [];
  window.addEventListener("dateatlas:google-sign-in-result", event => { if (event instanceof CustomEvent) results.push(event.detail); });
  for (const error of [undefined, "AbortError"]) {
    window.dispatchEvent(new CustomEvent("dateatlas:google-sign-in", { detail: { sessionId } }));
    const message = JSON.parse(messages.at(-1) ?? "null") as { id: string; type: string; sessionId: string };
    assert.equal(message.type, "google");
    assert.equal(message.sessionId, sessionId);
    window.dispatchEvent(new CustomEvent("dateatlas:native-result", { detail: { id: message.id, error, code: error ? undefined : "c".repeat(64) } }));
    await Promise.resolve();
  }
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [{ sessionId, code: "c".repeat(64) }, { sessionId, error: "AbortError" }]);
});

test("native location returns coordinates or app permission errors to the matching web request", async () => {
  const messages: string[] = [];
  const window = Object.assign(new EventTarget(), { ReactNativeWebView: { postMessage: (message: string) => messages.push(message) } });
  runInNewContext(browserScript("https://adateatlas.com"), {
    location: { origin: "https://adateatlas.com" }, window,
    navigator: {}, HTMLAnchorElement: class {}, Event, CustomEvent, DOMException,
    document: { documentElement: {}, elementFromPoint: () => null, addEventListener() {} },
    MutationObserver: class { observe() {} }, addEventListener() {}, requestAnimationFrame() {},
  });
  const results: unknown[] = [];
  window.addEventListener("dateatlas:location-result", event => { if (event instanceof CustomEvent) results.push(event.detail); });
  for (const [requestId, result] of [
    ["first", { coordinates: { lat: 6.45, lng: 3.46 } }],
    ["second", { locationError: { code: 1, message: "Allow location in your device settings." } }],
  ] as const) {
    window.dispatchEvent(new CustomEvent("dateatlas:location", { detail: { requestId } }));
    const message = readBrowserMessage(messages.at(-1) ?? "null");
    assert.ok(message?.type === "location");
    window.dispatchEvent(new CustomEvent("dateatlas:native-result", { detail: { id: message.id, ...result } }));
    await Promise.resolve();
  }
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [
    { requestId: "first", coordinates: { lat: 6.45, lng: 3.46 } },
    { requestId: "second", error: { code: 1, message: "Allow location in your device settings." } },
  ]);
});
