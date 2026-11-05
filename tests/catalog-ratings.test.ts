import test from "node:test";
import assert from "node:assert/strict";
import { catalogExperiencesMeetRatingRequirement } from "../lib/planner/catalog-ratings";

const experience = { placeId: "google-venue", demo: false };

test("catalog recommendations require actual Google place identity before provider lookup", async () => {
  let calls = 0;
  const lookup = async () => { calls += 1; return { rating: 5, operational: true }; };
  assert.equal(await catalogExperiencesMeetRatingRequirement([{ demo: false }], lookup), false);
  assert.equal(await catalogExperiencesMeetRatingRequirement([{ placeId: " ", demo: false }], lookup), false);
  assert.equal(await catalogExperiencesMeetRatingRequirement([], lookup), false);
  assert.equal(calls, 0);
});

test("catalog venue quality uses the fresh aggregate rating and rejects missing or downgraded ratings", async () => {
  for (const rating of [undefined, 0, 3.74, 3.75, NaN, Infinity, 5.1]) {
    assert.equal(await catalogExperiencesMeetRatingRequirement([experience], async () => ({ rating, operational: true })), false);
  }
  for (const rating of [3.7501, 3.8, 4, 5]) {
    assert.equal(await catalogExperiencesMeetRatingRequirement([experience], async () => ({ rating, operational: true })), true);
  }
  assert.equal(await catalogExperiencesMeetRatingRequirement([experience], async () => ({ rating: 5, operational: false })), false);
});

test("every selected catalog venue must qualify and repeated place identities are fetched once", async () => {
  const lookedUp: string[] = [];
  const selected = [experience, { ...experience, placeId: "second-venue" }, experience];
  const result = await catalogExperiencesMeetRatingRequirement(selected, async (id) => {
    lookedUp.push(id);
    return { rating: id === "second-venue" ? 3.75 : 5, operational: true };
  });
  assert.equal(result, false);
  assert.deepEqual(lookedUp, ["google-venue", "second-venue"]);
  assert.equal(await catalogExperiencesMeetRatingRequirement(Array.from({ length: 5 }, () => experience), async () => { throw new Error("Must not fetch an unbounded plan"); }), false);
});

test("provider failure cannot fall back to editorial quality or a previous rating", async () => {
  assert.equal(await catalogExperiencesMeetRatingRequirement([experience], async () => { throw new Error("Provider unavailable"); }), false);
});

test("fictional catalog data bypasses lookup only in explicitly enabled server demo mode", async () => {
  const fixture = { demo: true };
  let calls = 0;
  const lookup = async () => { calls += 1; return { rating: 3, operational: true }; };
  assert.equal(await catalogExperiencesMeetRatingRequirement([fixture], lookup), false);
  assert.equal(await catalogExperiencesMeetRatingRequirement([fixture], lookup, true), true);
  assert.equal(await catalogExperiencesMeetRatingRequirement([experience], lookup, true), false);
  assert.equal(await catalogExperiencesMeetRatingRequirement([fixture, experience], lookup, true), false);
  assert.equal(calls, 1);
});
