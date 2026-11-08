import assert from "node:assert/strict";
import test from "node:test";
import { hasRetainedGenerationAttempt, retainedGenerationKey } from "../lib/membership/generation-attempt";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("a pending generation survives refresh only for its owner, flow and one-hour lifetime", async () => {
  const tab = storage();
  const now = 10_000;
  const body = JSON.stringify({ notes: "PRIVATE date preferences", request: "same answers" });
  const first = await retainedGenerationKey(tab, "owner", "first-flow", body, now);
  assert.equal(hasRetainedGenerationAttempt(tab, "owner", "first-flow", now + 100), true);
  assert.equal(hasRetainedGenerationAttempt(tab, "another-owner", "first-flow", now + 100), false);
  assert.equal(hasRetainedGenerationAttempt(tab, "owner", "another-flow", now + 100), false);
  assert.equal(hasRetainedGenerationAttempt(tab, "owner", "first-flow", now + 3600000), false);
  assert.equal(await retainedGenerationKey(tab, "owner", "first-flow", body, now + 100), first);
  assert.notEqual(await retainedGenerationKey(tab, "owner", "first-flow", "different answers", now + 100), first);
  assert.doesNotMatch([...tab.values.values()].join(""), /PRIVATE|preferences|same answers/);
});

test("invalid or unbounded retained attempts do not bypass the allowance gate", () => {
  const tab = storage();
  const now = 1000;
  const key = "date-atlas:generation-attempt:v1:flow";
  for (const value of ["invalid JSON", JSON.stringify({ owner: "owner", key: "not-a-uuid", fingerprint: "digest", expiresAt: now + 1000 }), JSON.stringify({ owner: "owner", key: crypto.randomUUID(), fingerprint: "digest", expiresAt: now + 3600001 })]) {
    tab.setItem(key, value);
    assert.equal(hasRetainedGenerationAttempt(tab, "owner", "flow", now), false);
  }
  assert.equal(hasRetainedGenerationAttempt({ getItem: () => { throw new Error("Storage blocked"); } }, "owner", "flow", now), false);
});
