import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserLocationFailure, browserLocationError, getBrowserCoordinates, resolveLocation } from "../lib/maps/client-location";

const coordinates = { lat: 6.4474, lng: 3.4723 };
const detected = { location: { city: "Lagos", area: "Lekki Phase I", country: "Nigeria" }, suggestedAreas: ["Lekki Phase I"] };

class PositionSource {
  success: ((position: { coords: { latitude: number; longitude: number } }) => void) | null = null;
  failure: ((error: { code: number }) => void) | null = null;
  options: PositionOptions | undefined;
  cleared: number[] = [];
  watches = 0;
  watchPosition(success: (position: { coords: { latitude: number; longitude: number } }) => void, failure: (error: { code: number }) => void, options: PositionOptions) {
    this.watches++; this.success = success; this.failure = failure; this.options = options;
    return 7;
  }
  clearWatch(id: number) { this.cleared.push(id); }
}

test("device detection reuses recent low-power browser positions and stops after one result", async () => {
  const source = new PositionSource();
  const result = getBrowserCoordinates(new AbortController().signal, source);
  assert.deepEqual(source.options, { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 });
  source.success?.({ coords: { latitude: coordinates.lat, longitude: coordinates.lng } });
  assert.deepEqual(await result, coordinates);
  assert.deepEqual(source.cleared, [7]);
  source.success?.({ coords: { latitude: 50, longitude: 1 } });
  assert.deepEqual(source.cleared, [7], "Late browser callbacks cannot restart a completed watch");
});

test("device detection has a wall-clock deadline even if the permission callback never arrives", async () => {
  const source = new PositionSource();
  await assert.rejects(getBrowserCoordinates(new AbortController().signal, source, 5), error => error instanceof BrowserLocationFailure && error.code === 3);
  assert.deepEqual(source.cleared, [7]);
});

test("cancelling device detection clears its watch and ignores a late position", async () => {
  const source = new PositionSource();
  const controller = new AbortController();
  const result = getBrowserCoordinates(controller.signal, source);
  controller.abort();
  source.success?.({ coords: { latitude: coordinates.lat, longitude: coordinates.lng } });
  await assert.rejects(result, { name: "AbortError" });
  assert.deepEqual(source.cleared, [7]);
  await assert.rejects(getBrowserCoordinates(controller.signal, source), { name: "AbortError" });
  assert.equal(source.watches, 1);
});

test("device errors keep permission recovery codes and malformed positions fail closed", async () => {
  const denied = new PositionSource();
  const first = getBrowserCoordinates(new AbortController().signal, denied);
  denied.failure?.({ code: 1 });
  await assert.rejects(first, error => error instanceof BrowserLocationFailure && error.code === 1);
  assert.deepEqual(denied.cleared, [7]);
  const invalid = new PositionSource();
  const second = getBrowserCoordinates(new AbortController().signal, invalid);
  invalid.success?.({ coords: { latitude: Infinity, longitude: 181 } });
  await assert.rejects(second, error => error instanceof BrowserLocationFailure && error.code === 2);
  assert.deepEqual(invalid.cleared, [7]);
});

test("a synchronously cached position still releases the returned watch ID", async () => {
  const cleared: number[] = [];
  const result = await getBrowserCoordinates(new AbortController().signal, {
    watchPosition(success) { success({ coords: { latitude: coordinates.lat, longitude: coordinates.lng } }); return 0; },
    clearWatch(id) { cleared.push(id); },
  });
  assert.deepEqual(result, coordinates);
  assert.deepEqual(cleared, [0]);
});

test("location permission, unavailable-position and timeout errors explain different recovery steps", () => {
  assert.match(browserLocationError(1), /browser settings/);
  assert.match(browserLocationError(2), /Location Services/);
  assert.match(browserLocationError(3), /too long/);
});

test("location lookup posts device coordinates and validates the returned neighborhood", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/location");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), coordinates);
    return Response.json(detected);
  };
  assert.deepEqual(await resolveLocation(coordinates, new AbortController().signal, fetcher), detected);
  await assert.rejects(resolveLocation(coordinates, new AbortController().signal, async () => Response.json({ location: {} })), /couldn't be identified/);
});

test("server rate-limit and configuration errors reach the location UI", async () => {
  const fetcher: typeof fetch = async () => Response.json({ error: "Please wait one minute and try again." }, { status: 429 });
  await assert.rejects(resolveLocation(coordinates, new AbortController().signal, fetcher), /wait one minute/);
  await assert.rejects(resolveLocation(coordinates, new AbortController().signal, async () => { throw new TypeError("Failed to fetch"); }), /Check your connection/);
});

test("a stalled area lookup times out and aborts the underlying request", async () => {
  let lookupSignal: AbortSignal | null | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    lookupSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
  };
  await assert.rejects(resolveLocation(coordinates, new AbortController().signal, fetcher, 5), /Finding your area took too long/);
  assert.equal(lookupSignal?.aborted, true);
});

test("canceling a location lookup aborts it without returning a stale result", async () => {
  const controller = new AbortController();
  const fetcher: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    controller.abort();
  });
  await assert.rejects(resolveLocation(coordinates, controller.signal, fetcher), { name: "AbortError" });
});

test("a late reverse lookup cannot return a result after its deadline", async () => {
  await assert.rejects(resolveLocation(coordinates, new AbortController().signal, async () => {
    await new Promise(resolve => setTimeout(resolve, 12));
    return Response.json(detected);
  }, 5), /Finding your area took too long/);
});
