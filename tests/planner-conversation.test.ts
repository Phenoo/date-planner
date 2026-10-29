import test from "node:test";
import assert from "node:assert/strict";
import { requestSchema } from "../lib/planner/schema";
import { conversationAnswerKey, conversationChoices, conversationInput, conversationInputSchema, conversationSteps, fallbackConversation, localReaction, validateConversationCopy } from "../lib/planner/conversation";
import { plannerQuestions } from "../lib/planner/questions";

const request = requestSchema.parse({ city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60000, vibes: ["Creative"], duration: 300, interests: "Art and quiet spaces", yourGender: "woman", dateGender: "non-binary", startingArea: "A private starting address", dietary: ["vegan"], accessibility: true, notes: "Private notes" });

test("conversation context excludes identities, exact location and private requirements", () => {
  const input = conversationInput("vibes", request);
  assert.ok(conversationInputSchema.safeParse(input).success);
  const serialized = JSON.stringify(input);
  for (const value of ["woman", "non-binary", "Private notes", "A private starting address", "vegan", "accessibility"]) assert.ok(!serialized.includes(value));
  assert.equal(conversationInputSchema.safeParse({ ...input, context: { ...input.context, yourGender: "woman" } }).success, false);
  assert.equal(conversationInputSchema.safeParse({ ...input, context: { ...input.context, lat: 6.4 } }).success, false);
  assert.equal(conversationInputSchema.safeParse({ ...input, step: "invented" }).success, false);
});
test("every form step has usable local dialogue and validates only its actual answer keys", () => {
  assert.deepEqual([...conversationSteps], plannerQuestions.map(({ id }) => id));
  for (const step of conversationSteps) {
    const input = conversationInput(step, request);
    const fallback = fallbackConversation(input);
    assert.equal(fallback.ai, false);
    assert.ok(localReaction(step, request).length > 3);
    assert.ok(validateConversationCopy(input, fallback));
    assert.equal(validateConversationCopy(input, { ...fallback, responses: [{ key: "invented", line: "This must not be used." }] }), null);
    assert.equal(validateConversationCopy(input, { ...fallback, responses: [...fallback.responses, fallback.responses[0]] }), null);
    assert.equal(validateConversationCopy(input, { ...fallback, prompt: "Go to https://example.com" }), null);
  }
});
test("acknowledgements use the actual selection, including optional answers", () => {
  assert.equal(conversationAnswerKey("yourGender", request), "woman");
  assert.equal(conversationAnswerKey("dateGender", { ...request, dateGender: "" }), "open");
  assert.equal(conversationAnswerKey("budget", { ...request, budget: null }), "no");
  assert.equal(conversationAnswerKey("budget", request), "yes");
  assert.equal(conversationAnswerKey("time", { ...request, startTime: "" }), "open");
  assert.equal(conversationChoices("yourGender").length, 4);
  assert.deepEqual(conversationChoices("date").map(({ key }) => key), ["weekday", "weekend"]);
});
test("unanswered defaults never masquerade as choices, and gender replies stay neutral", () => {
  const beginning = conversationInput("yourGender", request);
  assert.equal(beginning.context.city, "");
  assert.equal(beginning.context.occasion, "");
  assert.equal(beginning.context.day, null);
  assert.deepEqual(beginning.context.vibes, []);
  assert.deepEqual(conversationInput("interests", request).context.vibes, request.vibes);
  assert.equal(conversationInput("review", request).context.duration, request.duration);
  const copy = fallbackConversation(beginning);
  assert.equal(validateConversationCopy(beginning, { ...copy, responses: copy.responses.map(({ key }) => ({ key, line: "She will love romantic restaurants." })) }), null);
  assert.equal(validateConversationCopy(beginning, { ...copy, prompt: "Let's make a lovely evening for you." }), null);
  assert.equal(validateConversationCopy(beginning, { ...copy, prompt: "Let's plan a lovely Saturday together." }), null);
  assert.equal(validateConversationCopy(beginning, { ...copy, responses: copy.responses.map(({ key }) => ({ key, line: "Shall we pick a time now?" })) }), null);
  assert.equal(conversationInput("occasion", { ...request, currentCity: "Lagos", city: "Abuja" }).context.city, "Abuja");
});
