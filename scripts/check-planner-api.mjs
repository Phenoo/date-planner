import assert from "node:assert/strict";
const origin = process.env.DATE_ATLAS_TEST_ORIGIN || "http://127.0.0.1:3000";
const request = {
  city: "Lagos",
  area: "Lekki",
  occasion: "Romantic date",
  budget: 60000,
  vibes: ["Romantic", "Creative"],
  date: "2026-10-31",
  startTime: "15:00",
  duration: 300,
  interests: "art and quiet restaurants",
  quiet: true,
};
async function post(path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const generated = await post("/api/plans", { request });
assert.equal(generated.status, 200);
assert.equal(generated.data.plans.length, 3);
assert.ok(
  generated.data.plans.every(
    (plan) =>
      plan.total <= 60000 && plan.duration <= 300 && plan.transportCost > 0,
  ),
);
const plan = generated.data.plans[1];
const experienceIds = plan.activities.map((activity) => activity.experience.id);
const swap = await post("/api/plans/swap", {
  request,
  experienceIds,
  index: 0,
});
assert.equal(swap.status, 200);
assert.ok(swap.data.alternatives.length);
assert.ok(
  swap.data.alternatives.every(
    (alternative) =>
      alternative.total <= 60000 &&
      alternative.activities
        .slice(1)
        .every(
          (activity, index) =>
            activity.experience.id === experienceIds[index + 1],
        ),
  ),
);
const removed = await post("/api/plans/customize", {
  request,
  experienceIds: experienceIds.slice(1),
});
assert.equal(removed.status, 200);
assert.ok(removed.data.plan.total < plan.total);
const withoutMeal = await post("/api/plans/customize", {
  request,
  experienceIds: plan.activities
    .filter((activity) => !activity.experience.tags.includes("meal"))
    .map((activity) => activity.experience.id),
});
assert.equal(withoutMeal.status, 422);
const duplicate = await post("/api/plans/customize", {
  request,
  experienceIds: [experienceIds[0], experienceIds[0]],
});
assert.equal(duplicate.status, 400);
const invalid = await post("/api/plans", {
  request: { ...request, budget: -1 },
});
assert.equal(invalid.status, 400);
const noMatch = await post("/api/plans", {
  request: { ...request, city: "Abuja" },
});
assert.equal(noMatch.status, 200);
assert.equal(noMatch.data.plans.length, 0);
const changed = await post("/api/planner-chat", {
  request,
  message: "She's vegetarian; make it cheaper",
});
assert.equal(changed.status, 200);
assert.ok(changed.data.plans.length);
assert.ok(
  changed.data.plans.every(
    (plan) =>
      plan.total <= 60000 && plan.request.dietary.includes("vegetarian"),
  ),
);
const unauthorized = await fetch(`${origin}/api/saved-plans`);
assert.ok([401, 503].includes(unauthorized.status));
console.log(
  "API journey passed: three constrained plans, swaps, edit recalculation, meal and duplicate protection, chat, empty results, and protected cloud saves.",
);
