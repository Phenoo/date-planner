import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRecurringDate, recurringDateSettingsSchema } from "../lib/membership/recurring-date-night";

const settings = recurringDateSettingsSchema.parse({
  city: "Lagos", country: "Nigeria", firstDate: "2027-01-31", startTime: "19:00",
  cadence: "monthly", budget: 50000, vibe: "Romantic",
});

test("monthly date nights keep the original day after a short month", () => {
  const lagos = { ...settings, timeZone: "Africa/Lagos" };
  const february = nextRecurringDate(lagos, Date.parse("2027-02-01T00:00:00Z"));
  assert.deepEqual(february, {
    date: "2027-02-28", startsAt: Date.parse("2027-02-28T18:00:00Z"), sendAt: Date.parse("2027-02-26T18:00:00Z"),
  });
  assert.equal(nextRecurringDate(lagos, february.startsAt).date, "2027-03-31");
});

test("recurring date nights keep local time through daylight saving and skip missing times", () => {
  const newYork = { ...settings, cadence: "weekly" as const, firstDate: "2027-03-07", startTime: "02:30", timeZone: "America/New_York" };
  const next = nextRecurringDate(newYork, Date.parse("2027-03-08T00:00:00Z"));
  assert.equal(next.date, "2027-03-21");
  assert.equal(next.startsAt, Date.parse("2027-03-21T06:30:00Z"));
  assert.equal(nextRecurringDate({ ...newYork, cadence: "biweekly" }, next.startsAt).date, "2027-04-04");
});
