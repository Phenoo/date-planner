import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCatalog } from "../lib/planner/demo-catalog";
import {
  generatePlans,
  recalculateExactPlan,
  totalBudget,
} from "../lib/planner/engine";
import {
  generateSchema,
  requestSchema,
  type Experience,
  type PlanRequest,
} from "../lib/planner/schema";
import { interpretModification } from "../lib/planner/ai";
import { decodeShare, encodeShare, parseSaved } from "../lib/planner/saved";

const base = requestSchema.parse({
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
});
function generate(patch: Partial<PlanRequest> = {}, catalog = demoCatalog) {
  return generatePlans(
    generateSchema.parse({ request: { ...base, ...patch } }),
    catalog,
  );
}

test("a server-resolved origin controls the travel radius instead of a preset area center", () => {
  const input = generateSchema.parse({ request: base });
  assert.ok(generatePlans(input, demoCatalog).plans.length > 0);
  assert.equal(generatePlans(input, demoCatalog, undefined, { lat: 9.08, lng: 7.39 }).plans.length, 0);
});

test("Lekki scenario produces three distinct, correctly costed plans under ₦60,000", () => {
  const { plans } = generate();
  assert.equal(plans.length, 3);
  assert.equal(
    new Set(
      plans.map((plan) =>
        plan.activities
          .map((activity) => activity.experience.id)
          .sort()
          .join(),
      ),
    ).size,
    3,
  );
  for (const plan of plans) {
    assert.ok(plan.total <= 60000);
    assert.ok(plan.duration <= 300);
    assert.equal(
      plan.total,
      plan.activityCost + plan.transportCost + plan.contingencyCost,
    );
    assert.equal(plan.remaining, 60000 - plan.total);
    assert.ok(plan.transportCost > 0);
    assert.ok(plan.activities.length >= 2 && plan.activities.length <= 4);
    assert.ok(
      plan.activities.every(
        (activity) =>
          activity.experience.quiet &&
          activity.experience.approved &&
          activity.experience.demo,
      ),
    );
    assert.ok(
      plan.activities.some((activity) =>
        activity.experience.tags.includes("food"),
      ),
    );
    plan.activities.forEach((activity, index) => {
      assert.ok(
        activity.experience.hours.some(
          (hours) =>
            hours.day === 6 &&
            hours.open <= activity.start &&
            hours.close >= activity.end,
        ),
      );
      if (index)
        assert.ok(
          activity.start >=
            plan.activities[index - 1].end + activity.travelMinutes,
        );
    });
  }
});
test("hard spending limit and impossible locations return no invented options", () => {
  assert.equal(generate({ budget: 1000 }).plans.length, 0);
  assert.equal(generate({ city: "Abuja" }).plans.length, 0);
  assert.equal(generate({ area: "Unknown area" }).plans.length, 0);
  assert.equal(generate({ country: "Ghana" }).plans.length, 0);
});
test("an unset budget imposes no hidden limit and returns serializable cost estimates", () => {
  const expensive = demoCatalog.map((experience) => ({ ...experience, price: experience.price * 10 }));
  const result = generate({ budget: null }, expensive);
  assert.ok(result.plans.length > 0);
  for (const plan of result.plans) {
    assert.equal(plan.budget, null);
    assert.equal(plan.remaining, null);
    assert.equal(plan.request.budget, null);
    assert.ok(plan.total > 60000);
    assert.ok(Number.isFinite(plan.total));
    assert.equal(plan.total, plan.activityCost + plan.transportCost + plan.contingencyCost);
    assert.equal(decodeShare(encodeShare(plan))?.request.budget, null);
  }
  assert.equal(generate({ budget: 60000 }, expensive).plans.length, 0);
  assert.equal(generate({ budget: null, city: "Abuja" }, expensive).plans.length, 0);
});
test("per-person spending multiplies once; guest and transport costs are respected", () => {
  const request = { ...base, budget: 30000, budgetType: "per-person" as const };
  assert.equal(totalBudget(request), 60000);
  for (const plan of generate(request).plans) {
    assert.equal(plan.budget, 60000);
    assert.ok(plan.total <= 60000);
    for (const activity of plan.activities)
      assert.equal(activity.cost, activity.experience.price * 2);
  }
  assert.ok(
    generate({ includeTransport: false }).plans.every(
      (plan) => plan.transportCost === 0,
    ),
  );
  assert.equal(generate({ guests: 12 }).plans.length, 0);
});
test("closed, unapproved, inaccessible and unsupported dietary options are excluded", () => {
  const catalog = demoCatalog.map(
    (item, index): Experience => ({
      ...item,
      accessible: index < 3 ? null : false,
    }),
  );
  assert.equal(generate({ accessibility: true }, catalog).plans.length, 0);
  assert.equal(
    generate(
      {},
      demoCatalog.map((item) => ({ ...item, approved: false })),
    ).plans.length,
    0,
  );
  assert.equal(generate({ startTime: "23:00", duration: 60 }).plans.length, 0);
  assert.equal(
    generate(
      {},
      demoCatalog.map((item) => ({
        ...item,
        hours: item.hours.filter((hours) => hours.day !== 6),
      })),
    ).plans.length,
    0,
  );
  for (const plan of generate({ dietary: ["vegan"] }).plans) {
    assert.ok(
      plan.activities
        .filter((activity) => activity.experience.tags.includes("food"))
        .every((activity) => activity.experience.dietary.includes("vegan")),
    );
  }
});
test("first dates use public venues and restaurant exclusion is a hard constraint", () => {
  assert.equal(
    generate(
      { occasion: "First date" },
      demoCatalog.map((item) => ({ ...item, publicVenue: false })),
    ).plans.length,
    0,
  );
  assert.ok(
    generate({ avoidRestaurants: true }).plans.every((plan) =>
      plan.activities.every(
        (activity) => !activity.experience.tags.includes("restaurant"),
      ),
    ),
  );
});
test("return travel and end time must fit; no negative or overlapping schedules", () => {
  for (const plan of generate({ endTime: "18:00", duration: 300 }).plans) {
    assert.ok(plan.duration <= 180);
    assert.ok(plan.activities.at(-1)!.end + plan.returnTravel <= 1080);
  }
  assert.equal(
    generate({ startTime: "20:00", endTime: "19:00" }).plans.length,
    0,
  );
});
test("locked experiences survive regeneration or produce an honest empty result", () => {
  const plan = generate().plans[1];
  const lockedId = plan.activities[0].experience.id;
  const result = generatePlans(
    generateSchema.parse({
      request: base,
      lockedIds: [lockedId],
      variation: 3,
    }),
    demoCatalog,
  );
  assert.ok(result.plans.length > 0);
  assert.ok(
    result.plans.every((plan) =>
      plan.activities.some((activity) => activity.experience.id === lockedId),
    ),
  );
  assert.equal(
    generatePlans(
      generateSchema.parse({ request: base, lockedIds: ["not-a-record"] }),
      demoCatalog,
    ).plans.length,
    0,
  );
});
test("swapping recalculates exact activities and rejects unaffordable replacements", () => {
  const plan = generate().plans[1];
  const original = plan.activities.map((activity) => activity.experience);
  const alternatives = demoCatalog
    .filter((item) => !original.some((existing) => existing.id === item.id))
    .flatMap((item) => {
      const plan = recalculateExactPlan(base, [item, ...original.slice(1)]);
      return plan ? [plan] : [];
    });
  assert.ok(alternatives.length);
  for (const next of alternatives) {
    assert.ok(next.total <= 60000);
    assert.deepEqual(
      next.activities.slice(1).map((activity) => activity.experience.id),
      original.slice(1).map((item) => item.id),
    );
  }
  assert.equal(
    recalculateExactPlan(base, [
      { ...original[0], price: 1000000 },
      ...original.slice(1),
    ]),
    null,
  );
});
test("unverified real-world records cannot enter results", () => {
  const catalog = demoCatalog.map((item) => ({
    ...item,
    demo: false,
    verifiedAt: null,
    sourceUrl: null,
  }));
  assert.equal(generate({}, catalog).plans.length, 0);
});
test("supported chat changes modify engine constraints without inflating budget", async () => {
  const change = await interpretModification(
    "She's vegetarian; make it cheaper",
    base,
  );
  assert.equal(change.understood, true);
  assert.equal(change.mode, "cheaper");
  assert.ok(change.request.dietary.includes("vegetarian"));
  assert.equal(change.request.budget, base.budget);
  const unknown = await interpretModification(
    "Can you reserve a helicopter?",
    base,
  );
  assert.equal(unknown.understood, false);
});
test("share links round-trip without personal notes; malformed saves are rejected", () => {
  const plan = generate().plans[0];
  plan.request = {
    ...plan.request,
    notes: "Private note",
    interests: "Private interests",
    dislikes: "Private dislikes",
    currentCity: "Private home city",
    startingArea: "Private starting area",
    yourGender: "man",
    dateGender: "non-binary",
  };
  const restored = decodeShare(encodeShare(plan));
  assert.ok(restored);
  assert.equal(restored.request.notes, "");
  assert.equal(restored.request.interests, "");
  assert.equal(restored.request.currentCity, "");
  assert.equal(restored.request.startingArea, "");
  assert.equal(restored.request.yourGender, "");
  assert.equal(restored.request.dateGender, "");
  assert.deepEqual(
    restored.experienceIds,
    plan.activities.map((activity) => activity.experience.id),
  );
  assert.equal(decodeShare("invalid"), null);
  assert.deepEqual(parseSaved('{"not":"a plan"}'), []);
});
test("invalid, non-finite and oversized input is rejected", () => {
  for (const patch of [
    { budget: -1 },
    { guests: 1.5 },
    { startTime: "25:00" },
    { date: "2026-02-31" },
    { duration: 0 },
    { notes: "a".repeat(2001) },
    { vibes: [] },
  ])
    assert.equal(requestSchema.safeParse({ ...base, ...patch }).success, false);
});

test("a meal is required when food is included, and the best plan covers art and restaurants", () => {
  const plans = generate().plans;
  for (const plan of plans)
    assert.ok(
      plan.activities.some((activity) =>
        activity.experience.tags.includes("meal"),
      ),
    );
  const best = plans.find((plan) => plan.type === "Best overall match")!;
  assert.ok(
    best.activities.some((activity) =>
      activity.experience.tags.includes("art"),
    ),
  );
  assert.ok(
    best.activities.some((activity) =>
      activity.experience.tags.includes("restaurant"),
    ),
  );
});
test("saving the same activities on a different date produces a distinct plan key", () => {
  const plan = generate().plans[1];
  const experiences = plan.activities.map((activity) => activity.experience);
  const another = recalculateExactPlan(
    { ...base, date: "2026-11-07" },
    experiences,
  );
  assert.ok(another);
  assert.notEqual(another.id, plan.id);
});

test("removing an activity recalculates spending and preserves the requested meal", () => {
  const original = generate().plans.find(
    (plan) => plan.type === "Best overall match",
  )!;
  const experiences = original.activities.map(
    (activity) => activity.experience,
  );
  const mealOnly = experiences.filter((experience) =>
    experience.tags.includes("meal"),
  );
  const edited = recalculateExactPlan(base, mealOnly, undefined, demoCatalog);
  assert.ok(edited);
  assert.ok(edited.total < original.total);
  assert.ok(original.budget !== null);
  assert.equal(edited.remaining, original.budget - edited.total);
  assert.equal(
    edited.total,
    edited.activityCost + edited.transportCost + edited.contingencyCost,
  );
  assert.equal(
    recalculateExactPlan(
      base,
      experiences.filter((experience) => !experience.tags.includes("meal")),
      undefined,
      demoCatalog,
    ),
    null,
  );
});

test("reordering is checked against each venue's actual opening window", () => {
  const art = demoCatalog.find((experience) =>
    experience.tags.includes("art"),
  )!;
  const food = demoCatalog.find(
    (experience) =>
      experience.tags.includes("meal") && experience.area === "Lekki",
  )!;
  const first: Experience = {
    ...art,
    id: "timed-art",
    duration: 45,
    hours: [{ day: 6, open: 900, close: 980 }],
  };
  const second: Experience = {
    ...food,
    id: "timed-meal",
    duration: 45,
    hours: [{ day: 6, open: 960, close: 1140 }],
  };
  const request = { ...base, quiet: false, duration: 300 };
  const valid = recalculateExactPlan(
    request,
    [first, second],
    undefined,
    demoCatalog,
  );
  assert.ok(valid);
  assert.deepEqual(
    valid.activities.map((activity) => activity.experience.id),
    [first.id, second.id],
  );
  assert.equal(
    recalculateExactPlan(request, [second, first], undefined, demoCatalog),
    null,
  );
});

test("adding a discovered experience keeps it in every plan or returns no valid plan", () => {
  const result = generatePlans(
    generateSchema.parse({ request: base, preferredIds: ["demo-clay"] }),
    demoCatalog,
  );
  assert.ok(result.plans.length);
  assert.ok(
    result.plans.every((plan) =>
      plan.activities.some(
        (activity) => activity.experience.id === "demo-clay",
      ),
    ),
  );
  const impossible = generatePlans(
    generateSchema.parse({
      request: { ...base, budget: 1000 },
      preferredIds: ["demo-clay"],
    }),
    demoCatalog,
  );
  assert.equal(impossible.plans.length, 0);
});
