import { test } from "node:test";
import assert from "node:assert/strict";
import { browserLocationError, resolveLocation } from "../lib/maps/client-location";

const coordinates = { lat: 6.4474, lng: 3.4723 };
const detected = { location: { city: "Lagos", area: "Lekki Phase I", country: "Nigeria" }, suggestedAreas: ["Lekki Phase I"] };

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
