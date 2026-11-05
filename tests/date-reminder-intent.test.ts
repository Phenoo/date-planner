import test from "node:test";
import assert from "node:assert/strict";
import { readDateReminderIntent, reminderRecipientKey } from "../lib/planner/date-reminder-intent";

const sessionId = "7e88a84a-9b9d-4e27-8d36-4ea105055d77";
test("reminder opt-in survives verified sign-in only for the same date and bounded lifetime", async () => {
  const now = Date.now();
  const intent = { sessionId, placeId: "chosen-place", recipientKey: await reminderRecipientKey("person@example.test"), expiresAt: now + 3600000 };
  assert.deepEqual(readDateReminderIntent(JSON.stringify(intent), sessionId, "chosen-place", now), intent);
  for (const raw of [null, "bad-json", JSON.stringify({ ...intent, expiresAt: now }), JSON.stringify({ ...intent, expiresAt: now + 3600001 }), JSON.stringify({ ...intent, recipientKey: "bad-key" })]) {
    assert.equal(readDateReminderIntent(raw, sessionId, "chosen-place", now), null);
  }
  assert.equal(readDateReminderIntent(JSON.stringify(intent), undefined, "chosen-place", now), null);
  assert.equal(readDateReminderIntent(JSON.stringify(intent), "8e88a84a-9b9d-4e27-8d36-4ea105055d77", "chosen-place", now), null);
  assert.equal(readDateReminderIntent(JSON.stringify(intent), sessionId, "another-place", now), null);
});

test("reminder recipient binding matches normalized verified emails without persisting the address", async () => {
  assert.equal(await reminderRecipientKey("  Person@Example.test "), await reminderRecipientKey("person@example.test"));
  assert.notEqual(await reminderRecipientKey("person@example.test"), await reminderRecipientKey("another@example.test"));
  assert.match(await reminderRecipientKey("person@example.test"), /^[a-f0-9]{64}$/);
});
