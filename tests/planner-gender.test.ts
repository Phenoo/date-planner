import test from "node:test";
import assert from "node:assert/strict";
import { genderLabel, genderOptions, generateSchema, requestSchema } from "../lib/planner/schema";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { generatePlans } from "../lib/planner/engine";
import { discoveryPreferences } from "../lib/planner/discovery-ai";
import { parseSaved, toRecipe } from "../lib/planner/saved";

const input = { city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60000, vibes: ["Creative"], date: "2026-10-31", startTime: "15:00", duration: 300 };

test("gender answers are optional and old planning requests remain valid", () => {
  const request = requestSchema.parse(input);
  assert.equal(request.yourGender, "");
  assert.equal(request.dateGender, "");
  assert.equal(genderLabel(request.yourGender), "Prefer not to say");
  for (const option of genderOptions) {
    const parsed = requestSchema.parse({ ...input, yourGender: option.value, dateGender: option.value });
    assert.equal(parsed.yourGender, option.value);
    assert.equal(genderLabel(parsed.dateGender), option.label);
  }
  for (const value of [null, 1, [], "invalid-value"]) {
    assert.equal(requestSchema.safeParse({ ...input, yourGender: value }).success, false);
    assert.equal(requestSchema.safeParse({ ...input, dateGender: value }).success, false);
  }
});

test("gender does not change venue eligibility, ranking, budgets or preference match keys", () => {
  const baseline = generatePlans(generateSchema.parse({ request: input }), demoCatalog);
  assert.ok(baseline.plans.length);
  const choices = baseline.plans.map((plan) => ({ places: plan.activities.map((activity) => activity.experience.id), total: plan.total }));
  const preferences = discoveryPreferences(requestSchema.parse(input));
  for (const yourGender of genderOptions.map((option) => option.value)) {
    const request = requestSchema.parse({ ...input, yourGender, dateGender: "non-binary" });
    const result = generatePlans(generateSchema.parse({ request }), demoCatalog);
    assert.deepEqual(result.plans.map((plan) => ({ places: plan.activities.map((activity) => activity.experience.id), total: plan.total })), choices);
    assert.deepEqual(discoveryPreferences(request), preferences);
  }
});

test("private saved plans retain independently editable gender answers", () => {
  const result = generatePlans(generateSchema.parse({ request: { ...input, yourGender: "woman", dateGender: "non-binary" } }), demoCatalog);
  assert.ok(result.plans.length);
  const restored = parseSaved(JSON.stringify([toRecipe(result.plans[0])]))[0];
  assert.ok(restored);
  assert.equal(restored.request.yourGender, "woman");
  assert.equal(restored.request.dateGender, "non-binary");
});
