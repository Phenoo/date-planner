import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { BrowserLocationFailure, getBrowserCoordinates, nativeLocationSupport, subscribeNativeLocation } from "../lib/maps/client-location";

test("native coordinates use the permission bridge, preserve denial messages and clean up on abort", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = Object.assign(new EventTarget(), { ReactNativeWebView: { postMessage() {} }, __dateAtlasNative: false, __dateAtlasNativeLocation: false });
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  try {
    assert.equal(nativeLocationSupport(), null);
    target.__dateAtlasNative = true;
    assert.equal(nativeLocationSupport(), false);
    let notifications = 0;
    const unsubscribe = subscribeNativeLocation(() => notifications++);
    target.__dateAtlasNativeLocation = true;
    target.dispatchEvent(new Event("dateatlas:native-ready"));
    assert.equal(nativeLocationSupport(), true);
    assert.equal(notifications, 1);
    unsubscribe();
    assert.equal(getEventListeners(target, "dateatlas:native-ready").length, 0);

    let requestId = "";
    target.addEventListener("dateatlas:location", event => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      assert.ok(detail && typeof detail === "object" && "requestId" in detail && typeof detail.requestId === "string");
      requestId = detail.requestId;
    });
    const position = getBrowserCoordinates(new AbortController().signal);
    target.dispatchEvent(new CustomEvent("dateatlas:location-result", { detail: { requestId: "wrong-request", coordinates: { lat: 0, lng: 0 } } }));
    target.dispatchEvent(new CustomEvent("dateatlas:location-result", { detail: { requestId, coordinates: { lat: 6.45, lng: 3.46 } } }));
    assert.deepEqual(await position, { lat: 6.45, lng: 3.46 });
    assert.equal(getEventListeners(target, "dateatlas:location-result").length, 0);

    const denied = getBrowserCoordinates(new AbortController().signal);
    target.dispatchEvent(new CustomEvent("dateatlas:location-result", { detail: { requestId, error: { code: 1, message: "Allow location in device settings." } } }));
    await assert.rejects(denied, error => error instanceof BrowserLocationFailure && error.code === 1 && error.message === "Allow location in device settings.");
    const controller = new AbortController();
    const pending = getBrowserCoordinates(controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(getEventListeners(target, "dateatlas:location-result").length, 0);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
});
