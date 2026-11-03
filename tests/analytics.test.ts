import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsMeasurementId, analyticsPage, analyticsReferrer, createAnalyticsSession, type GoogleTag } from "../lib/analytics/policy";

const id = "G-GBKWTQBD2N";
const origin = "https://date-atlas.vercel.app";

function session() {
  const calls: Parameters<GoogleTag>[] = [];
  const disabled: boolean[] = [];
  return { calls, disabled, analytics: createAnalyticsSession(id, origin, (...command) => { calls.push(command); }, (value) => disabled.push(value)) };
}

test("analytics accepts only a GA4 measurement ID", () => {
  assert.equal(analyticsMeasurementId(id), id);
  for (const invalid of [undefined, "", "GTM-ABCDEF", "UA-123-1", `${id}<script>`, "G-incomplete"]) assert.equal(analyticsMeasurementId(invalid), null);
});

test("analytics page names exclude query strings, hashes, invitation tokens and experience IDs", () => {
  assert.deepEqual(analyticsPage("/plan?oobCode=private-code&email=person@example.com#private"), { path: "/plan", title: "Planner · adal" });
  assert.deepEqual(analyticsPage("/invite/private-token"), { path: "/invite", title: "Invitation · adal" });
  assert.deepEqual(analyticsPage("/experiences/private-venue-id"), { path: "/experiences", title: "Experience · adal" });
  for (const path of ["/admin", "/api/planning-session", "/unknown/private", "/invite/one/two"]) assert.equal(analyticsPage(path), null);
  assert.equal(analyticsPage("/privacy/")?.path, "/privacy");
});

test("analytics referrers retain acquisition hosts without private paths or parameters", () => {
  assert.equal(analyticsReferrer("https://example.com/private-person?email=person@example.com#private", origin), "https://example.com/");
  assert.equal(analyticsReferrer(`${origin}/invite/private-token?oobCode=secret`, origin), `${origin}/invite`);
  assert.equal(analyticsReferrer(`${origin}/admin/private`, origin), `${origin}/`);
  assert.equal(analyticsReferrer("javascript:alert(1)", origin), "");
  assert.equal(analyticsReferrer("", origin), "");
});

test("inactive sessions and excluded pages send no analytics events", () => {
  const { analytics, calls, disabled } = session();
  analytics.pageView("/plan", ""); analytics.event("planner_started"); analytics.consent(false);
  assert.equal(calls.length, 0);
  analytics.consent(true); analytics.pageView("/admin", ""); analytics.event("planner_started");
  assert.equal(calls.length, 0);
  assert.equal(disabled.at(-1), true);
});

test("analytics initializes with advertising disabled, explicit page views and sanitized defaults", () => {
  const { analytics, calls } = session();
  analytics.consent(true);
  analytics.pageView("/invite/private-token", "https://example.com/private?email=person@example.com");
  assert.deepEqual(calls[0], ["consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" }]);
  const config = calls.find((call) => call[0] === "config");
  assert.ok(config && config[0] === "config");
  assert.equal(config[2].send_page_view, false);
  assert.equal(config[2].allow_google_signals, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(config[2].page_location, `${origin}/invite`);
  assert.equal(config[2].page_referrer, "https://example.com/");
  assert.doesNotMatch(JSON.stringify(calls), /private-token|person@example.com|email=/);
});

test("navigation records one page view per visit and no dynamic identifiers in planning events", () => {
  const { analytics, calls } = session();
  analytics.consent(true);
  analytics.pageView("/plan", ""); analytics.pageView("/plan", "");
  analytics.pageView("/experiences/one", ""); analytics.pageView("/experiences/two", "");
  analytics.event("recommendation_accepted");
  const views = calls.filter((call) => call[0] === "event" && call[1] === "page_view");
  assert.equal(views.length, 3);
  const event = calls.at(-1);
  assert.ok(event && event[0] === "event");
  assert.deepEqual(event[2], { page_location: `${origin}/experiences`, page_title: "Experience · adal", page_referrer: `${origin}/experiences`, send_to: id });
});

test("stopping a session prevents later events until it is restarted", () => {
  const { analytics, calls, disabled } = session();
  analytics.consent(true); analytics.pageView("/plan", "");
  analytics.consent(false);
  assert.equal(disabled.at(-1), true);
  const count = calls.length;
  analytics.pageView("/saved", ""); analytics.event("planner_started");
  assert.equal(calls.length, count);
  analytics.consent(true); analytics.pageView("/saved", "");
  assert.equal(disabled.at(-1), false);
  assert.equal(calls.filter((call) => call[0] === "event" && call[1] === "page_view").length, 2);
});
