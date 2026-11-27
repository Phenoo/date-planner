import test from "node:test";
import assert from "node:assert/strict";
import { confirmedDeletionToken, DeletionSessionChangedError } from "../lib/firebase/account-deletion-session";

test("deletion authorization stays bound to the account that opened confirmation", async () => {
  let calls = 0;
  const first = { uid: "account-a", getIdToken: async () => { calls++; return "token-a"; } };
  const second = { uid: "account-b", getIdToken: async () => { calls++; return "token-b"; } };
  let current: typeof first | null = first;
  const expected = current.uid;
  current = second;
  await assert.rejects(confirmedDeletionToken(() => current, expected, new AbortController().signal), DeletionSessionChangedError);
  assert.equal(calls, 0, "A newly signed-in account is never authorized by an earlier confirmation");
  current = first;
  assert.equal(await confirmedDeletionToken(() => current, expected, new AbortController().signal), "token-a");
});

test("account changes or unmounts during token refresh cannot submit deletion", async () => {
  let release: ((token: string) => void) | undefined;
  let current: { uid: string; getIdToken(forceRefresh?: boolean): Promise<string> } | null = { uid: "guest-a", getIdToken: () => new Promise(resolve => { release = resolve; }) };
  const attempt = confirmedDeletionToken(() => current, current.uid, new AbortController().signal);
  current = { uid: "account-b", getIdToken: async () => "token-b" };
  assert.ok(release); release("token-a");
  await assert.rejects(attempt, DeletionSessionChangedError);
  const controller = new AbortController();
  current = { uid: "guest-a", getIdToken: async () => { controller.abort(); return "token-a"; } };
  await assert.rejects(confirmedDeletionToken(() => current, current.uid, controller.signal), { name: "AbortError" });
});
