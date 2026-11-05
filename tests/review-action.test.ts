import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { transform } from "esbuild";

type Rectangle = { top: number; bottom: number; left: number; right: number; width: number; height: number; x: number; y: number; toJSON: () => object };
type Placeholder = { getBoundingClientRect: () => Rectangle };
type ObserveReviewAction = (placeholder: Placeholder, onChange: (floating: boolean) => void) => () => void;
type Observer = { connected: boolean; callback: () => void; targets: object[]; options?: { threshold?: number | number[] } };

function rectangle(top: number, bottom: number): Rectangle {
  return { top, bottom, left: 0, right: 400, width: 400, height: bottom - top, x: 0, y: top, toJSON: () => ({ top, bottom }) };
}

async function observerSource() {
  const path = join(process.cwd(), "components/date-atlas/planner-wizard.tsx");
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "observeReviewAction");
  assert.ok(declaration?.body, "Exercise the actual review action observer without importing the wizard or its providers");
  return (await transform(declaration.getText(source), { loader: "ts", target: "es2022", format: "cjs" })).code;
}

function fixture(source: string, initialScrollY = 0) {
  const listeners = new Map<string, Set<() => void>>();
  const addedListeners: { event: string; options: unknown }[] = [];
  const frames = new Map<number, () => void>();
  const canceledFrames: number[] = [];
  const intersectionObservers: Observer[] = [];
  const resizeObservers: Observer[] = [];
  const body = {};
  let nextFrame = 0;
  let bounds = rectangle(1000, 1080);
  let headerBounds = rectangle(0, 96);
  const header = { getBoundingClientRect: () => headerBounds };
  const app = { querySelector: (selector: string) => { assert.equal(selector, ".atlas-header"); return header; } };
  const placeholder = { getBoundingClientRect: () => bounds, closest: (selector: string) => { assert.equal(selector, ".atlas-app"); return app; } };
  const window = {
    scrollY: initialScrollY,
    innerHeight: 800,
    addEventListener(event: string, callback: () => void, options?: unknown) {
      addedListeners.push({ event, options });
      const callbacks = listeners.get(event) ?? new Set<() => void>();
      callbacks.add(callback);
      listeners.set(event, callbacks);
    },
    removeEventListener(event: string, callback: () => void) { listeners.get(event)?.delete(callback); },
  };
  const requestAnimationFrame = (callback: () => void) => { const frame = ++nextFrame; frames.set(frame, callback); return frame; };
  const cancelAnimationFrame = (frame: number) => { canceledFrames.push(frame); frames.delete(frame); };
  class IntersectionObserver {
    readonly record: Observer;
    constructor(callback: () => void, options?: Observer["options"]) {
      this.record = { connected: true, callback, targets: [], options };
      intersectionObservers.push(this.record);
    }
    observe(target: object) { this.record.targets.push(target); }
    disconnect() { this.record.connected = false; }
  }
  class ResizeObserver {
    readonly record: Observer;
    constructor(callback: () => void) {
      this.record = { connected: true, callback, targets: [] };
      resizeObservers.push(this.record);
    }
    observe(target: object) { this.record.targets.push(target); }
    disconnect() { this.record.connected = false; }
  }
  const extracted: unknown = runInNewContext(`${source}\nobserveReviewAction`, {
    window,
    document: { body },
    requestAnimationFrame,
    cancelAnimationFrame,
    IntersectionObserver,
    ResizeObserver,
  });
  function isObserver(value: unknown): value is ObserveReviewAction { return typeof value === "function"; }
  assert.ok(isObserver(extracted));
  const changes: boolean[] = [];
  const onChange = (floating: boolean) => changes.push(floating);
  let cleanup = extracted(placeholder, onChange);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  };
  const emit = (event: string) => { [...listeners.get(event) ?? []].forEach((callback) => callback()); };
  const notify = (observers: Observer[]) => { observers.filter(({ connected }) => connected).forEach(({ callback }) => callback()); };
  return {
    window, placeholder, body, frames, canceledFrames, changes, cleanup: () => cleanup(), flush, listeners, addedListeners, intersectionObservers, resizeObservers,
    restart() { cleanup(); cleanup = extracted(placeholder, onChange); },
    floating: () => changes.at(-1) ?? false,
    scrollTo(y: number) { window.scrollY = y; emit("scroll"); },
    setBounds(top: number, bottom: number) { bounds = rectangle(top, bottom); },
    setHeader(top: number, bottom: number) { headerBounds = rectangle(top, bottom); },
    resize(height: number) { window.innerHeight = height; emit("resize"); },
    intersect() { notify(intersectionObservers); },
    reflow() { notify(resizeObservers); },
  };
}

const source = observerSource();

test("the review action stays in its original slot until a real downward scroll", async () => {
  const page = fixture(await source, 200);
  page.flush();
  assert.equal(page.floating(), false, "A restored scroll position must not cause a first-paint floating action");
  page.intersect();
  page.resize(700);
  page.reflow();
  page.flush();
  assert.equal(page.floating(), false, "Observers and viewport changes cannot substitute for a user scroll");
  page.scrollTo(150);
  page.flush();
  assert.equal(page.floating(), false, "An upward scroll does not arm the floating action");
  page.scrollTo(160);
  page.flush();
  assert.equal(page.floating(), true, "A downward scroll reveals the action when its original slot is off-screen");
  page.cleanup();
});

test("the floating action respects the top threshold and resets when returning to the top", async () => {
  const page = fixture(await source);
  page.flush();
  page.scrollTo(8);
  page.flush();
  assert.equal(page.floating(), false);
  page.scrollTo(9);
  page.flush();
  assert.equal(page.floating(), true);
  page.scrollTo(8);
  page.flush();
  assert.equal(page.floating(), false);
  page.scrollTo(0);
  page.flush();
  assert.equal(page.floating(), false);
  page.cleanup();
});

test("only a fully visible stationary footer hides the floating action", async () => {
  const page = fixture(await source);
  page.scrollTo(100);
  page.flush();
  assert.equal(page.floating(), true);
  page.setBounds(740, 820);
  page.intersect();
  page.flush();
  assert.equal(page.floating(), true, "A partially visible original action is not yet reachable in full");
  page.setBounds(720, 800);
  page.intersect();
  page.flush();
  assert.equal(page.floating(), false);
  page.setBounds(-80, 0);
  page.scrollTo(200);
  page.flush();
  assert.equal(page.floating(), true, "Scrolling beyond the original action must not lose the CTA");
  page.cleanup();
});

test("the sticky header counts as an occlusion of the stationary action", async () => {
  const page = fixture(await source);
  page.scrollTo(100);
  page.setBounds(80, 160);
  page.flush();
  assert.equal(page.floating(), true);
  page.setBounds(96, 176);
  page.intersect();
  page.flush();
  assert.equal(page.floating(), false);
  page.setHeader(0, 120);
  page.reflow();
  page.flush();
  assert.equal(page.floating(), true, "A taller sticky header can cover the action without another scroll");
  page.cleanup();
});

test("viewport resize and document reflow recheck visibility through one pending animation frame", async () => {
  const page = fixture(await source);
  page.scrollTo(100);
  page.setBounds(740, 820);
  page.flush();
  assert.equal(page.floating(), true);
  page.resize(900);
  page.reflow();
  page.intersect();
  assert.equal(page.frames.size, 1, "Independent geometry events should batch into a single measurement");
  page.flush();
  assert.equal(page.floating(), false);
  page.resize(800);
  page.flush();
  assert.equal(page.floating(), true);
  page.setBounds(600, 680);
  page.reflow();
  page.flush();
  assert.equal(page.floating(), false);
  assert.ok(page.addedListeners.some(({ event, options }) => event === "scroll" && typeof options === "object" && options !== null && "passive" in options && options.passive === true));
  assert.ok(page.intersectionObservers.some(({ options, targets }) => options?.threshold === 1 && targets.includes(page.placeholder)));
  assert.ok(page.resizeObservers.some(({ targets }) => targets.includes(page.body)));
  page.cleanup();
});

test("cleanup cancels pending work and removes every observer and listener", async () => {
  const page = fixture(await source);
  page.scrollTo(100);
  assert.equal(page.frames.size, 1);
  const pendingFrames = [...page.frames.values()];
  const queuedObserverCallbacks = [...page.intersectionObservers, ...page.resizeObservers].map(({ callback }) => callback);
  const changesBeforeCleanup = page.changes.length;
  page.cleanup();
  assert.equal(page.frames.size, 0);
  assert.ok(page.canceledFrames.length > 0);
  assert.ok([...page.listeners.values()].every((callbacks) => callbacks.size === 0));
  assert.ok(page.intersectionObservers.every(({ connected }) => !connected));
  assert.ok(page.resizeObservers.every(({ connected }) => !connected));
  page.scrollTo(200);
  page.resize(900);
  page.intersect();
  page.reflow();
  pendingFrames.forEach((callback) => callback());
  queuedObserverCallbacks.forEach((callback) => callback());
  assert.equal(page.frames.size, 0, "Already queued observer deliveries cannot restart work after cleanup");
  page.flush();
  assert.equal(page.changes.length, changesBeforeCleanup, "Unmounted or Activity-hidden review actions cannot publish further measurements");
});

test("restarting a preserved floating action resets it before another paint or scroll", async () => {
  const page = fixture(await source);
  page.scrollTo(100);
  page.flush();
  assert.equal(page.floating(), true);
  page.restart();
  assert.equal(page.floating(), false, "Activity reactivation or re-enabling must synchronously clear the previous floating state");
  page.resize(700);
  page.reflow();
  page.flush();
  assert.equal(page.floating(), false, "A restarted observer still needs a new downward scroll");
  page.scrollTo(150);
  page.flush();
  assert.equal(page.floating(), true);
  page.cleanup();
});
