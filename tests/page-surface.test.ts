import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { applyPageSurface, pageSurfaceBootstrap, parsePlannerAppearance, plannerAppearanceKey } from "../lib/planner/page-surface";

function documentRoot() {
  const attributes = new Map<string, string>();
  return { attributes, getAttribute: (name: string) => attributes.get(name) ?? null, setAttribute: (name: string, value: string) => { attributes.set(name, value); }, removeAttribute: (name: string) => { attributes.delete(name); } };
}

function bootstrap(pathname: string, savedAppearance: unknown, blocked = false) {
  const root = documentRoot();
  const reads: string[] = [];
  runInNewContext(pageSurfaceBootstrap, {
    document: { documentElement: root },
    window: { location: { pathname }, localStorage: { getItem(key: string) { reads.push(key); if (blocked) throw new Error("Storage blocked"); return savedAppearance; } } },
  });
  return { root, reads };
}

test("the prepaint bootstrap preserves all saved planner appearances without changing server-rendered content", () => {
  for (const appearance of ["white", "red", "dark"] as const) {
    const { root, reads } = bootstrap("/plan", appearance);
    assert.deepEqual(Object.fromEntries(root.attributes), { "data-page-surface": "planner", "data-planner-appearance": appearance });
    assert.deepEqual(reads, [plannerAppearanceKey]);
  }
});

test("unknown or inaccessible storage falls back to the red planner before hydration", () => {
  for (const value of [null, undefined, "", "Dark", "#fff", "white\" onload=alert(1)", {}, 1]) {
    assert.equal(parsePlannerAppearance(value), "red");
    assert.equal(bootstrap("/plan", value).root.attributes.get("data-planner-appearance"), "red");
  }
  assert.equal(bootstrap("/plan", "white", true).root.attributes.get("data-planner-appearance"), "red");
});

test("home always has its red canvas and unrelated pages do not inherit a stored planner theme", () => {
  const home = bootstrap("/", "white");
  assert.deepEqual(Object.fromEntries(home.root.attributes), { "data-page-surface": "home" });
  assert.deepEqual(home.reads, []);
  for (const pathname of ["/saved", "/profile", "/invite/example", "/partnerships", "/plans"]) {
    const other = bootstrap(pathname, "dark");
    assert.deepEqual(Object.fromEntries(other.root.attributes), {});
    assert.deepEqual(other.reads, []);
  }
});

test("soft navigation and Back replace the active route canvas without consulting retained page DOM", () => {
  const root = documentRoot();
  applyPageSurface(root, "/plan", "dark");
  assert.deepEqual(Object.fromEntries(root.attributes), { "data-page-surface": "planner", "data-planner-appearance": "dark" });
  applyPageSurface(root, "/saved", "dark");
  assert.deepEqual(Object.fromEntries(root.attributes), {});
  applyPageSurface(root, "/plan", "white");
  assert.deepEqual(Object.fromEntries(root.attributes), { "data-page-surface": "planner", "data-planner-appearance": "white" });
  applyPageSurface(root, "/", "white");
  assert.deepEqual(Object.fromEntries(root.attributes), { "data-page-surface": "home" });
});

test("the authenticated homepage keeps its light canvas across pageshow and clears its override when leaving", () => {
  const root = documentRoot();
  root.setAttribute("data-home-account", "true");
  applyPageSurface(root, "/", "dark");
  assert.deepEqual(Object.fromEntries(root.attributes), { "data-home-account": "true" });
  applyPageSurface(root, "/plan", "dark");
  assert.deepEqual(Object.fromEntries(root.attributes), { "data-page-surface": "planner", "data-planner-appearance": "dark" });
  applyPageSurface(root, "/", "dark");
  assert.deepEqual(Object.fromEntries(root.attributes), { "data-page-surface": "home" });
});
