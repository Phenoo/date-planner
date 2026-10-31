import test from "node:test";
import assert from "node:assert/strict";
import { playRevealDrumRoll } from "../lib/animations/reveal-drum";

test("the reveal remains usable when browser audio is unavailable or blocked", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  try {
    Reflect.deleteProperty(globalThis, "AudioContext");
    assert.equal(playRevealDrumRoll(), null);
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: class { constructor() { throw new Error("Audio unavailable"); } } });
    assert.equal(playRevealDrumRoll(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});

test("skipping or muting during pending audio startup prevents a late drum roll and closes once", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  let release = () => {};
  let closed = 0;
  let graphs = 0;
  class DelayedContext {
    state = "running";
    resume() { return new Promise<void>((resolve) => { release = resolve; }); }
    close() { closed++; return Promise.resolve(); }
    createGain() { graphs++; throw new Error("Playback should have been cancelled"); }
  }
  try {
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: DelayedContext });
    const stop = playRevealDrumRoll();
    assert.ok(stop);
    stop();
    stop();
    release();
    await Promise.resolve();
    assert.equal(closed, 1);
    assert.equal(graphs, 0);
  } finally {
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
