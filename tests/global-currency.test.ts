import test from "node:test";
import assert from "node:assert/strict";
import { budgetSuggestions, currencyForCountry, destinationCurrency, formatMoney, fromMinorUnits, toMinorUnits } from "../lib/planner/currency";
import { decodeExperience, decodePlanRequest, decodeRecipe, encodeExperience, encodePlan, encodeRecipe } from "../lib/planner/money";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { generateSchema, requestSchema } from "../lib/planner/schema";
import { generateSinglePlan } from "../lib/planner/engine";
import { toRecipe } from "../lib/planner/saved";
import { providerFactsSchema, venueRequestIssues } from "../lib/maps/venue-facts";

test("destination currencies cover regions and common aliases without guessing unknown countries", () => {
  for (const [country, currency] of [["Nigeria", "NGN"], ["UK", "GBP"], ["USA", "USD"], ["Japan", "JPY"], ["Kuwait", "KWD"], ["Brazil", "BRL"], ["South Africa", "ZAR"], ["Bulgaria", "EUR"], ["Singapore", "SGD"], ["United Arab Emirates", "AED"]]) assert.equal(currencyForCountry(country), currency);
  assert.equal(currencyForCountry("Not a country"), null);
  assert.match(formatMoney(40.5, "GBP"), /40\.50/);
  assert.match(formatMoney(1000, "JPY"), /1,000/);
  assert.ok(budgetSuggestions("GBP").every((amount) => amount < 1000));
});

test("currency changes clear an amount rather than silently converting it and preserve other answers", () => {
  const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Anniversary", budget: 40000, vibes: ["Creative"], duration: 240 });
  const next = destinationCurrency(request, "United Kingdom");
  assert.equal(next.currency, "GBP"); assert.equal(next.budget, null);
  assert.equal(next.occasion, request.occasion); assert.deepEqual(next.vibes, request.vibes);
  assert.deepEqual(destinationCurrency(request, "Nigeria"), request);
});

test("minor units support decimal and zero-decimal currencies and retain legacy naira records", () => {
  for (const [currency, amount, minor] of [["USD", 40.25, 4025], ["JPY", 1200, 1200], ["KWD", 4.125, 4125]] as const) {
    assert.equal(toMinorUnits(amount, currency), minor); assert.equal(fromMinorUnits(minor, currency), amount);
    const experience = { ...demoCatalog[0], currency, price: amount };
    assert.deepEqual(decodeExperience(encodeExperience(experience)), decodeExperience(experience));
  }
  const old = { ...demoCatalog[0], currency: "NGN", price: 125050, moneyUnit: "NGN_KOBO" };
  assert.equal(decodeExperience(old).data?.price, 1250.5);
  assert.throws(() => toMinorUnits(Infinity, "USD")); assert.throws(() => fromMinorUnits(1.2, "USD"));
});

test("foreign plans never use a naira fare or mix currencies and retain saved amounts", () => {
  const venue = { ...demoCatalog[0], id: "london-venue", city: "London", country: "United Kingdom", currency: "GBP", price: 15.5, area: "Bankside" };
  const input = generateSchema.parse({ request: { city: "London", country: "United Kingdom", currency: "GBP", area: "Bankside", occasion: "Anniversary", budget: 100, vibes: ["Creative"], date: "2030-11-02", startTime: "12:00", duration: 240, includeFood: false } });
  const plan = generateSinglePlan(input, [venue], undefined, { lat: venue.lat + .005, lng: venue.lng }).plans[0];
  assert.ok(plan); assert.equal(plan.activityCost, 31); assert.equal(plan.transportCost, 0); assert.deepEqual(plan.unpricedCosts, ["transport"]); assert.equal(plan.remaining, null); assert.ok(plan.total < 40);
  const encoded = encodePlan(plan); assert.equal(encoded.moneyUnit, "CURRENCY_MINOR"); assert.equal(encoded.activityCost, 3100);
  assert.deepEqual(decodePlanRequest(encoded), requestSchema.safeParse(plan.request));
  const recipe = toRecipe(plan); assert.deepEqual(decodeRecipe(encodeRecipe(recipe)), decodeRecipe(recipe));
  assert.equal(generateSinglePlan({ ...input, request: { ...input.request, currency: "USD" } }, [venue], undefined, venue).plans.length, 0);
  const quoted = generateSinglePlan({ ...input, request: { ...input.request, transportBudget: 12 } }, [venue], undefined, venue).plans[0];
  assert.ok(quoted); assert.equal(quoted.transportCost, 12); assert.equal(quoted.unpricedCosts, undefined);
});

test("provider minimum spend is compared only in the chosen currency", () => {
  const facts = providerFactsSchema.parse({ priceRange: { startPrice: { currencyCode: "GBP", units: "30" } } });
  const request = requestSchema.parse({ city: "London", country: "United Kingdom", currency: "GBP", area: "London", occasion: "Anniversary", budget: 40, vibes: ["Creative"], date: "2030-11-02", startTime: "12:00", duration: 240 });
  assert.ok(venueRequestIssues(facts, request, 1).includes("budget"));
  assert.ok(!venueRequestIssues(facts, { ...request, currency: "USD" }, 1).includes("budget"));
});
