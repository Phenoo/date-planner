import { areaCenters } from "./demo-catalog";
import { createHash } from "node:crypto";
import type {
  DatePlan,
  Experience,
  GenerateInput,
  PlanActivity,
  PlanRequest,
  RecommendationResult,
  ScoreBreakdown,
} from "./schema";

export const defaultWeights: ScoreBreakdown = {
  interests: 0.3,
  budget: 0.25,
  location: 0.2,
  occasion: 0.15,
  reliability: 0.1,
};
export const totalBudget = (request: PlanRequest) =>
  request.budget === null ? Infinity : request.budget * (request.budgetType === "per-person" ? request.guests : 1);
export const minuteOfDay = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const experienceCost = (experience: Experience, guests: number) =>
  experience.price * (experience.priceType === "per-person" ? guests : 1);
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.35;
}
function travel(distance: number, request: PlanRequest) {
  return distance < 0.05
    ? 0
    : Math.ceil(
        distance * (request.transport === "Walking" ? 15 : 4) +
          (request.transport === "Walking" ? 0 : 8),
      );
}
type Point = { lat: number; lng: number };
function startPoint(
  request: PlanRequest,
  catalog: Experience[],
): Point | undefined {
  const area = request.startingArea || request.area;
  if (
    request.city === "Lagos" &&
    request.country === "Nigeria" &&
    areaCenters[area]
  )
    return areaCenters[area];
  const local = catalog.filter(
    (item) =>
      item.area.toLowerCase() === area.toLowerCase() &&
      item.city.toLowerCase() === request.city.toLowerCase() &&
      item.country.toLowerCase() === request.country.toLowerCase(),
  );
  if (!local.length) return undefined;
  return {
    lat: local.reduce((sum, item) => sum + item.lat, 0) / local.length,
    lng: local.reduce((sum, item) => sum + item.lng, 0) / local.length,
  };
}
function dayOfWeek(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
function normalizedWords(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((word) => word.length > 2)
    .map((word) =>
      word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word,
    );
}
function rejectionReasons(
  experience: Experience,
  request: PlanRequest,
  origin?: Point,
) {
  const reasons: string[] = [];
  if (!experience.active || !experience.approved)
    reasons.push("Not active and approved");
  if (!experience.demo && (!experience.verifiedAt || !experience.sourceUrl))
    reasons.push("Missing verified source");
  if (
    experience.city.toLowerCase() !== request.city.toLowerCase() ||
    experience.country.toLowerCase() !== request.country.toLowerCase()
  )
    reasons.push("Outside selected city or country");
  if (!origin)
    reasons.push("No supported starting area; choose a catalog area");
  else if (distanceKm(origin, experience) > request.maxDistance)
    reasons.push("Outside travel radius");
  if (experienceCost(experience, request.guests) > totalBudget(request))
    reasons.push("Above spending limit");
  if (experience.maxGuests < request.guests)
    reasons.push("Guest count not supported");
  if (request.accessibility && experience.accessible !== true)
    reasons.push("Accessibility not confirmed");
  if (request.quiet && !experience.quiet)
    reasons.push("Not conversation-friendly");
  if (
    request.environment !== "any" &&
    experience.indoor !== (request.environment === "indoor")
  )
    reasons.push("Indoor/outdoor preference mismatch");
  if (request.occasion === "First date" && !experience.publicVenue)
    reasons.push("First dates require a public venue");
  if (request.avoidRestaurants && experience.tags.includes("restaurant"))
    reasons.push("Restaurants excluded");
  if (
    experience.tags.includes("food") &&
    !request.dietary.every((diet) => experience.dietary.includes(diet))
  )
    reasons.push("Dietary requirements not confirmed");
  const disliked = normalizedWords(request.dislikes);
  if (
    disliked.some(
      (word) =>
        experience.tags.some((tag) => tag.includes(word)) ||
        experience.category.toLowerCase().includes(word),
    )
  )
    reasons.push("Matches an activity you dislike");
  const start = minuteOfDay(request.startTime);
  const end = Math.min(
    start + request.duration,
    request.endTime ? minuteOfDay(request.endTime) : 1440,
    1440,
  );
  if (
    !experience.hours.some(
      (hours) =>
        hours.day === dayOfWeek(request.date) &&
        Math.max(start, hours.open) + experience.duration <=
          Math.min(end, hours.close),
    )
  )
    reasons.push("Closed or cannot fit in requested hours");
  return reasons;
}
export function scoreExperience(
  experience: Experience,
  request: PlanRequest,
  weights = defaultWeights,
  origin?: Point,
) {
  const words = normalizedWords(`${request.interests} ${request.notes}`);
  const preferenceMatches = words.filter(
    (word) =>
      experience.tags.some((tag) => tag.includes(word)) ||
      experience.description.toLowerCase().includes(word),
  ).length;
  const vibeMatch =
    request.vibes.filter((vibe) => experience.vibes.includes(vibe)).length /
    request.vibes.length;
  const scores: ScoreBreakdown = {
    interests: Math.min(
      1,
      vibeMatch * 0.75 +
        (words.length
          ? Math.min(1, preferenceMatches / Math.min(words.length, 3))
          : 0.5) *
          0.25,
    ),
    budget: Math.max(
      0,
      1 - experienceCost(experience, request.guests) / totalBudget(request),
    ),
    location: Math.max(
      0,
      1 - distanceKm(origin ?? experience, experience) / request.maxDistance,
    ),
    occasion: experience.occasions.includes(request.occasion) ? 1 : 0.25,
    reliability: experience.demo ? 0.35 : experience.quality,
  };
  const activeWeights = request.budget === null ? { ...weights, budget: 0 } : weights;
  const sum = Object.values(activeWeights).reduce((a, b) => a + b, 0);
  return {
    scores,
    score: Math.round(
      (Object.entries(scores).reduce(
        (result, [key, value]) =>
          result + value * activeWeights[key as keyof ScoreBreakdown],
        0,
      ) /
        sum) *
        100,
    ),
  };
}
function reason(experience: Experience, request: PlanRequest) {
  const matches = request.vibes.filter((vibe) =>
    experience.vibes.includes(vibe),
  );
  const parts = [
    matches.length
      ? `Matches your ${matches.slice(0, 2).join(" and ").toLowerCase()} side`
      : "Adds a different pace to your date",
  ];
  if (
    request.interests &&
    normalizedWords(request.interests).some((word) =>
      experience.tags.includes(word),
    )
  )
    parts.push("connects with the interests you shared");
  if (request.quiet && experience.quiet)
    parts.push("keeps things calm and conversation-friendly");
  parts.push(`keeps you around ${experience.area}`);
  return parts.join(", ") + ".";
}
function buildItinerary(
  experiences: Experience[],
  request: PlanRequest,
  weights: ScoreBreakdown,
  origin?: Point,
): DatePlan | null {
  if (!origin) return null;
  let previous = origin;
  const start = minuteOfDay(request.startTime);
  const deadline = Math.min(
    start + request.duration,
    request.endTime ? minuteOfDay(request.endTime) : 1440,
    1440,
  );
  let cursor = start;
  let totalDistance = 0;
  let transportCost = 0;
  const activities: PlanActivity[] = [];
  const vehicles = Math.ceil(request.guests / 3);
  const rideCost = (km: number) =>
    request.transport === "Walking"
      ? 0
      : Math.ceil(
          (request.transport === "Driving" ? km * 220 + 500 : 1000 + km * 450) /
            100,
        ) *
        100 *
        vehicles;
  for (const experience of experiences) {
    const distance = distanceKm(previous, experience);
    if (distance > request.maxDistance) return null;
    const travelMinutes = travel(distance, request);
    const arrival = cursor + travelMinutes;
    const slot = experience.hours
      .filter((hours) => hours.day === dayOfWeek(request.date))
      .sort((a, b) => a.open - b.open)
      .find(
        (hours) =>
          Math.max(arrival, hours.open) + experience.duration <= hours.close,
      );
    if (!slot) return null;
    // An itinerary may wait up to 30 minutes for opening, never silently shift the requested start.
    const activityStart = Math.max(arrival, slot.open);
    if (
      activityStart - arrival > 30 ||
      activityStart + experience.duration > deadline
    )
      return null;
    activities.push({
      experience,
      start: activityStart,
      end: activityStart + experience.duration,
      cost: experienceCost(experience, request.guests),
      travelMinutes,
      distance,
      reason: reason(experience, request),
    });
    const separateArrivals =
      !request.meetingTogether && !activities.slice(0, -1).length ? 2 : 1;
    transportCost +=
      distance > 0.05 ? rideCost(distance) * separateArrivals : 0;
    totalDistance += distance;
    cursor = activityStart + experience.duration;
    previous = experience;
  }
  const returnDistance = distanceKm(previous, origin);
  const returnTravel = travel(returnDistance, request);
  if (cursor + returnTravel > deadline || returnDistance > request.maxDistance)
    return null;
  totalDistance += returnDistance;
  transportCost += returnDistance > 0.05 ? rideCost(returnDistance) : 0;
  transportCost = request.includeTransport ? transportCost : 0;
  const activityCost = activities.reduce(
    (sum, activity) => sum + activity.cost,
    0,
  );
  const contingencyCost = request.contingency
    ? Math.ceil(((activityCost + transportCost) * 0.1) / 100) * 100
    : 0;
  const total = activityCost + transportCost + contingencyCost;
  const budget = totalBudget(request);
  if (
    total > budget ||
    (request.includeFood &&
      !experiences.some((experience) => experience.tags.includes("meal")))
  )
    return null;
  const scores = experiences.map((experience) =>
    scoreExperience(experience, request, weights, origin),
  );
  const breakdown = Object.fromEntries(
    Object.keys(weights).map((key) => [
      key,
      scores.reduce(
        (sum, score) => sum + score.scores[key as keyof ScoreBreakdown],
        0,
      ) / scores.length,
    ]),
  ) as ScoreBreakdown;
  const diversity = new Set(
    experiences.map((experience) => experience.category),
  ).size;
  const score = Math.min(
    99,
    Math.round(
      scores.reduce((sum, item) => sum + item.score, 0) / scores.length +
        Math.min(5, diversity * 1.5),
    ),
  );
  return {
    id: `${createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 16)}:${experiences.map((experience) => experience.id).join("~")}`,
    type: "Best overall match",
    title: experiences.some(
      (experience) => experience.category === "Art & culture",
    )
      ? "A little art, a lot of connection"
      : request.vibes.includes("Adventurous")
        ? "A day for something different"
        : "Good company, beautiful moments",
    introduction: `A thoughtfully paced ${request.occasion.toLowerCase()} around ${request.area}, with room to enjoy each other's company.`,
    score,
    scores: breakdown,
    activities,
    activityCost,
    transportCost,
    contingencyCost,
    total,
    remaining: request.budget === null ? null : budget - total,
    budget: request.budget === null ? null : budget,
    duration: cursor + returnTravel - start,
    totalDistance: Math.round(totalDistance * 10) / 10,
    returnTravel,
    request,
    demo: experiences.some((experience) => experience.demo),
    tips: [
      "All costs are estimates, including the selected food and drinks. Confirm prices before you go.",
      "Travel uses a distance-based estimate with a buffer; it does not include live traffic.",
      request.meetingTogether
        ? "Transport includes an estimated return to your starting area."
        : "Separate arrivals are estimated from the same starting area; individual pickup routes need confirmation.",
      request.surprises
        ? "Keep a small part of the plan a surprise. Share the dress code and meeting time."
        : "Share the itinerary in advance so you can both look forward to it.",
      ...(request.accessibility
        ? [
            "Accessibility is matched to catalog fields. Confirm specific needs with a real venue before visiting.",
          ]
        : []),
    ],
  };
}
export function generatePlans(
  input: GenerateInput,
  catalog: Experience[],
  weights = defaultWeights,
  originOverride?: Point,
): RecommendationResult {
  const { request, lockedIds, excludeIds, preferredIds, variation, mode } =
    input;
  if (!request.date || !request.startTime) return { plans: [], diagnostics: [], source: catalog.some((experience) => experience.demo) ? "demo" : "firebase", ai: false, warnings: ["Choose a place first, then agree on a day and time together."] };
  const origin = originOverride ?? startPoint(request, catalog);
  const diagnostics = catalog.map((experience) => {
    const reasons = rejectionReasons(experience, request, origin);
    if (excludeIds.includes(experience.id))
      reasons.push("Excluded from this regeneration");
    return {
      id: experience.id,
      name: experience.name,
      eligible: !reasons.length,
      reasons,
      ...(!reasons.length
        ? { score: scoreExperience(experience, request, weights, origin).score }
        : {}),
    };
  });
  const eligibleIds = new Set(
    diagnostics.filter((item) => item.eligible).map((item) => item.id),
  );
  const eligible = catalog
    .filter((experience) => eligibleIds.has(experience.id))
    .sort(
      (a, b) =>
        scoreExperience(b, request, weights, origin).score -
        scoreExperience(a, request, weights, origin).score,
    );
  const required = [...new Set([...lockedIds, ...preferredIds])];
  const source = catalog.some((experience) => experience.demo)
    ? "demo"
    : "firebase";
  const warnings =
    source === "demo"
      ? [
          "Demo mode: fictional venues, sample prices, and illustrative locations. No real-world availability or bookings.",
        ]
      : [
          "Prices and travel times are estimates. Contact venues to confirm availability before visiting.",
        ];
  if (!catalog.length)
    warnings.push("No verified experiences are available in the live catalog yet. Please check back as we curate places for your date.");
  if (!request.includeTransport)
    warnings.push(
      "Transportation is excluded from your spending total, but travel time is included in the schedule.",
    );
  if (request.flexible)
    warnings.push(
      "Your selected start time is used. Change the time to search another schedule.",
    );
  if (required.some((id) => !eligibleIds.has(id)))
    return {
      plans: [],
      warnings: [
        ...warnings,
        "A locked or selected experience no longer meets your constraints. Unlock it or adjust your preferences.",
      ],
      diagnostics,
      source,
      ai: false,
    };
  // Bound the search while retaining explicitly locked experiences.
  const candidates = [
    ...new Map(
      [
        ...eligible.filter((experience) => required.includes(experience.id)),
        ...eligible.slice(0, 18),
      ].map((experience) => [experience.id, experience]),
    ).values(),
  ];
  const possibilities: DatePlan[] = [];
  const seen = new Set<string>();
  function search(path: Experience[], diningCount: number) {
    const enoughActivities = path.length >= (request.duration < 150 ? 1 : 2);
    if (
      enoughActivities &&
      required.every((id) => path.some((experience) => experience.id === id))
    ) {
      const key = path
        .map((experience) => experience.id)
        .sort()
        .join("|");
      if (!seen.has(key)) {
        const plan = buildItinerary(path, request, weights, origin);
        if (plan) {
          seen.add(key);
          possibilities.push(plan);
        }
      }
    }
    if (path.length === 4) return;
    for (const experience of candidates) {
      if (
        path.some(
          (item) =>
            item.id === experience.id || item.venue === experience.venue,
        )
      )
        continue;
      if (experience.category === "Food & dining" && diningCount >= 1) continue;
      if (
        path.reduce((sum, item) => sum + item.duration, 0) +
          experience.duration >
        request.duration
      )
        continue;
      const partial = [...path, experience];
      if (
        partial.reduce(
          (sum, item) => sum + experienceCost(item, request.guests),
          0,
        ) > totalBudget(request)
      )
        continue;
      search(
        partial,
        diningCount + Number(experience.category === "Food & dining"),
      );
    }
  }
  search([], 0);
  const catalogTags = new Set(catalog.flatMap((experience) => experience.tags));
  const interestTags = [
    ...new Set(
      normalizedWords(`${request.interests} ${request.notes}`).filter((word) =>
        catalogTags.has(word),
      ),
    ),
  ];
  const costBasis = request.budget === null ? possibilities.reduce((highest, plan) => Math.max(highest, plan.total), 1) : totalBudget(request);
  const scoreFor = (plan: DatePlan) => {
    const preference = plan.activities.reduce(
      (sum, activity) =>
        sum +
        Number(activity.experience.vibes.includes("Unexpected")) +
        Number(activity.experience.category === "Unique experiences"),
      0,
    );
    const coverage = interestTags.length
      ? interestTags.filter((tag) =>
          plan.activities.some((activity) =>
            activity.experience.tags.includes(tag),
          ),
        ).length / interestTags.length
      : 0;
    const quality =
      plan.score + Math.min(6, plan.activities.length * 2) + coverage * 30;
    return mode === "cheaper"
      ? quality - (plan.total / costBasis) * 25
      : mode === "closer"
        ? quality - plan.totalDistance * 3
        : mode === "special"
          ? quality + preference * 6
          : quality;
  };
  possibilities.sort(
    (a, b) => scoreFor(b) - scoreFor(a) || a.totalDistance - b.totalDistance,
  );
  const chosen: DatePlan[] = [];
  const diverse = (plan: DatePlan) =>
    chosen.every(
      (other) =>
        plan.activities.some(
          (activity) =>
            !other.activities.some(
              (existing) => existing.experience.id === activity.experience.id,
            ),
        ) &&
        other.activities.some(
          (activity) =>
            !plan.activities.some(
              (existing) => existing.experience.id === activity.experience.id,
            ),
        ),
    );
  const pick = (pool: DatePlan[], type: DatePlan["type"], title: string) => {
    const options = pool.filter(diverse);
    const plan = options[variation % Math.min(options.length, 5)];
    if (plan) chosen.push({ ...plan, type, title });
  };
  pick(
    possibilities,
    "Best overall match",
    possibilities[0]?.title ?? "A date worth looking forward to",
  );
  pick(
    [...possibilities].sort((a, b) => a.total - b.total || b.score - a.score),
    "Smart & affordable",
    "Little moments, lovely memories",
  );
  pick(
    [...possibilities].sort((a, b) => {
      const special = (plan: DatePlan) =>
        scoreFor(plan) +
        plan.activities.reduce(
          (sum, activity) =>
            sum + (activity.experience.vibes.includes("Unexpected") ? 14 : 0),
          0,
        );
      return special(b) - special(a);
    }),
    "Something special",
    "Something a little unexpected",
  );
  if (!chosen.length)
    warnings.push(
      request.budget === null
        ? "No itinerary fits every requirement. Try a longer duration, a different time or area, or fewer restrictions."
        : "No itinerary fits every requirement. Try a longer duration, a different time or area, fewer restrictions, or a different budget. Your budget has not been increased.",
    );
  else if (chosen.length < 3)
    warnings.push(
      `Only ${chosen.length} distinct plan${chosen.length === 1 ? "" : "s"} meet all your requirements. Try a wider area or more time for additional options.`,
    );
  return {
    plans: chosen.sort(
      (a, b) =>
        [
          "Smart & affordable",
          "Best overall match",
          "Something special",
        ].indexOf(a.type) -
        [
          "Smart & affordable",
          "Best overall match",
          "Something special",
        ].indexOf(b.type),
    ),
    warnings,
    diagnostics,
    source,
    ai: false,
  };
}

export function recalculateExactPlan(
  request: PlanRequest,
  experiences: Experience[],
  weights = defaultWeights,
  catalog = experiences,
  originOverride?: Point,
): DatePlan | null {
  const origin = originOverride ?? startPoint(request, catalog);
  if (
    !experiences.length ||
    experiences.length > 4 ||
    new Set(experiences.map((item) => item.id)).size !== experiences.length
  )
    return null;
  if (
    experiences.some(
      (experience) => rejectionReasons(experience, request, origin).length,
    )
  )
    return null;
  return buildItinerary(experiences, request, weights, origin);
}
