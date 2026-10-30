import { test } from "node:test";
import assert from "node:assert/strict";
import { requestSchema } from "../lib/planner/schema";
import { savedAccountKey, readPendingSave, readPendingPlanAction } from "../lib/planner/saved";
import { readPendingInvitation } from "../lib/planner/invitations";

test("saved-plan caches cannot share a namespace across accounts or use the old unowned cache", () => {
  assert.notEqual(savedAccountKey("account-one"), savedAccountKey("account-two"));
  assert.notEqual(savedAccountKey("account-one"), "date-atlas:saved:v1");
});
test("pending saves retain the selected timing and expire after the authentication window", () => {
  const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", vibes: ["Relaxed"], budget: 60000, duration: 180, date: "2026-11-14", startTime: "18:00" });
  const recipe = { id: "test", title: "Test plan", type: "Best overall match", request, experienceIds: ["test-place"], total: 30000, image: "", demo: true, savedAt: new Date().toISOString() };
  const raw = JSON.stringify({ recipe, expiresAt: 1500 });
  assert.deepEqual(readPendingSave(raw, 1000)?.request, request);
  assert.equal(readPendingPlanAction(raw, 1000)?.action, "save", "Existing pending saves retain their meaning");
  assert.equal(readPendingPlanAction(JSON.stringify({ recipe, action: "share", expiresAt: 1500 }), 1000)?.action, "share");
  assert.equal(readPendingPlanAction(JSON.stringify({ recipe, action: "share", flow: "old-plan", expiresAt: 1500 }), 1000, "another-plan"), null, "Signing in elsewhere must not publish an old pending plan");
  assert.equal(readPendingSave(raw, 1500), null);
  assert.equal(readPendingSave("broken", 1000), null);
  assert.equal(readPendingSave(JSON.stringify({ recipe, expiresAt: 3601001 }), 1000), null);
});
test("an invitation intent resumes only for the same accepted place and unexpired session", () => {
  const sessionId = "12345678-1234-4123-8123-123456789012";
  const raw = JSON.stringify({ sessionId, placeId: "test-place", expiresAt: 1500 });
  assert.equal(readPendingInvitation(raw, sessionId, "test-place", 1000), "create");
  assert.equal(readPendingInvitation(raw, sessionId, "another-place", 1000), null);
  assert.equal(readPendingInvitation(raw, undefined, "test-place", 1000), null);
  assert.equal(readPendingInvitation(raw, sessionId, "test-place", 1500), null);
});
