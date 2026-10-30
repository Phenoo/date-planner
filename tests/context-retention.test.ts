import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { contextExpired } from "../lib/server/context-retention";

test("temporary context expires at its deadline even before asynchronous cleanup", () => {
  assert.equal(contextExpired({ expiresAt: Timestamp.fromMillis(2000) }, 1999), false);
  assert.equal(contextExpired({ expiresAt: Timestamp.fromMillis(2000) }, 2000), true);
});
test("legacy context uses its timestamp and cannot become an indefinite private draft", () => {
  assert.equal(contextExpired({ createdAt: Timestamp.fromMillis(1000) }, 3600999), false);
  assert.equal(contextExpired({ updatedAt: Timestamp.fromMillis(1000) }, 3601000), true);
  assert.equal(contextExpired({}, 2000), true);
  assert.equal(contextExpired({ expiresAt: "untrusted" }, 2000), true);
});
