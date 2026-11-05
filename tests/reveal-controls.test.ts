import test from "node:test";
import assert from "node:assert/strict";
import { watchRevealControls } from "../lib/planner/reveal-controls";

class Viewport extends EventTarget {
  scrollTop = 0;
  scrollHeight = 1200;
  clientHeight = 600;
  scrollTo(top: number) { this.scrollTop = top; this.dispatchEvent(new Event("scroll")); }
}

function fixture() {
  const viewport = new Viewport();
  let now = 0;
  let ready = 0;
  let timer: { at: number; callback: () => void } | null = null;
  let resize: (() => void) | null = null;
  let lastTimer: (() => void) | null = null;
  let lastResize: (() => void) | null = null;
  const stop = watchRevealControls(viewport, () => { ready++; }, {
    schedule(callback, delayMs) { timer = { at: now + delayMs, callback }; lastTimer = callback; return () => { timer = null; }; },
    observeResize(callback) { resize = callback; lastResize = callback; return () => { resize = null; }; },
  });
  return {
    viewport, stop,
    ready: () => ready,
    advance(milliseconds: number) { now += milliseconds; if (timer && timer.at <= now) { const callback = timer.callback; timer = null; callback(); } },
    resize() { resize?.(); },
    lateCallbacks() { lastTimer?.(); lastResize?.(); },
    subscribed: () => timer !== null || resize !== null,
  };
}

test("an early scroll latches but controls wait the full five seconds", () => {
  const view = fixture();
  view.viewport.scrollTo(9);
  view.viewport.scrollTo(0);
  view.advance(4999);
  assert.equal(view.ready(), 0);
  view.advance(1);
  assert.equal(view.ready(), 1);
  assert.equal(view.subscribed(), false);
  view.viewport.scrollTo(100);
  view.lateCallbacks();
  assert.equal(view.ready(), 1, "Ready fires once even if queued events arrive after cleanup");
});

test("overflow remains locked after five seconds until a positive scroll event", () => {
  const view = fixture();
  view.viewport.scrollTop = 100;
  view.advance(5000);
  assert.equal(view.ready(), 0, "Initial scroll position alone does not count as a scroll event");
  view.viewport.scrollTo(0);
  view.viewport.scrollTo(8);
  assert.equal(view.ready(), 0, "A reset and an eight-pixel scroll do not satisfy the threshold");
  view.viewport.scrollTo(9);
  assert.equal(view.ready(), 1);
});

test("a viewport with at most eight pixels of overflow unlocks after five seconds", () => {
  const view = fixture();
  view.viewport.scrollHeight = 608;
  view.advance(4999);
  assert.equal(view.ready(), 0);
  view.advance(1);
  assert.equal(view.ready(), 1);
});

test("content growth before the deadline removes the no-overflow exception", () => {
  const view = fixture();
  view.viewport.scrollHeight = 600;
  view.resize();
  view.advance(3000);
  view.viewport.scrollHeight = 900;
  view.resize();
  view.advance(2000);
  assert.equal(view.ready(), 0);
  view.viewport.scrollTo(25);
  assert.equal(view.ready(), 1);
});

test("a resize after the deadline can unlock a viewport that no longer overflows", () => {
  const view = fixture();
  view.advance(5000);
  assert.equal(view.ready(), 0);
  view.viewport.clientHeight = 1200;
  view.resize();
  assert.equal(view.ready(), 1);
});

test("cleanup prevents timer, scroll and already queued resize callbacks from unlocking", () => {
  const view = fixture();
  view.stop();
  view.stop();
  assert.equal(view.subscribed(), false);
  view.viewport.scrollTo(50);
  view.advance(6000);
  view.lateCallbacks();
  assert.equal(view.ready(), 0);
});
