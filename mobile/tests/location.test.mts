import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { AbortController as NativeAbortController } from "abort-controller";
import { getAppCoordinates } from "../src/location.ts";

type Source = Parameters<typeof getAppCoordinates>[0];
type Position = Parameters<Parameters<Source["watchPositionAsync"]>[0]>[0];

function fixture(granted = true, enabled = true) {
  const state: { requests: number; watches: number; removed: number; success: (position: Position) => void } = { requests: 0, watches: 0, removed: 0, success: () => {} };
  const source: Source = {
    async requestForegroundPermissionsAsync() { state.requests++; return { granted }; },
    async hasServicesEnabledAsync() { return enabled; },
    async watchPositionAsync(success) { state.watches++; state.success = success; return { remove() { state.removed++; } }; },
  };
  return { source, state };
}

test("native location asks foreground permission and stops GPS after the first valid fix", async () => {
  const { source, state } = fixture();
  const operation = getAppCoordinates(source, new AbortController().signal);
  await setImmediate();
  assert.equal(state.requests, 1);
  assert.equal(state.watches, 1);
  state.success({ coords: { latitude: 6.45, longitude: 3.46 } });
  assert.deepEqual(await operation, { coordinates: { lat: 6.45, lng: 3.46 } });
  assert.equal(state.removed, 1);
});

test("location works with React Native's AbortSignal polyfill", async () => {
  const { source, state } = fixture();
  const controller = new NativeAbortController();
  const operation = getAppCoordinates(source, controller.signal);
  await setImmediate();
  assert.equal(state.requests, 1);
  assert.equal(state.watches, 1);
  controller.abort();
  await assert.rejects(operation, { name: "AbortError" });
  assert.equal(state.removed, 1);
});

test("denial and disabled services return actionable errors without starting GPS", async () => {
  for (const [granted, enabled, code] of [[false, true, 1], [true, false, 2]] as const) {
    const { source, state } = fixture(granted, enabled);
    const result = await getAppCoordinates(source, new AbortController().signal);
    assert.ok("locationError" in result);
    assert.equal(result.locationError.code, code);
    assert.match(result.locationError.message, /device|Location Services/);
    assert.equal(state.watches, 0);
  }
});

test("canceling while permission is pending never starts a GPS subscription", async () => {
  const { source, state } = fixture();
  let allow: (permission: { granted: boolean }) => void = () => {};
  source.requestForegroundPermissionsAsync = () => new Promise(resolve => { allow = resolve; });
  const controller = new AbortController();
  const operation = getAppCoordinates(source, controller.signal);
  controller.abort(); allow({ granted: true });
  await assert.rejects(operation, { name: "AbortError" });
  assert.equal(state.watches, 0);
});

test("a subscription arriving after cancellation is immediately removed", async () => {
  const { source, state } = fixture();
  let registered: (subscription: { remove: () => void }) => void = () => {};
  source.watchPositionAsync = () => new Promise(resolve => { registered = resolve; });
  const controller = new AbortController();
  const operation = getAppCoordinates(source, controller.signal);
  await setImmediate(); controller.abort();
  await assert.rejects(operation, { name: "AbortError" });
  registered({ remove() { state.removed++; } });
  await setImmediate();
  assert.equal(state.removed, 1);
});

test("timeouts and invalid fixes stop GPS and allow manual location", async () => {
  const timed = fixture();
  const result = await getAppCoordinates(timed.source, new AbortController().signal, 5);
  assert.ok("locationError" in result);
  assert.equal(result.locationError.code, 3);
  assert.equal(timed.state.removed, 1);
  const invalid = fixture();
  const operation = getAppCoordinates(invalid.source, new AbortController().signal);
  await setImmediate(); invalid.state.success({ coords: { latitude: 91, longitude: 3 } });
  assert.ok("locationError" in await operation);
  assert.equal(invalid.state.removed, 1);
});
