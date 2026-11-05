import test from "node:test";
import assert from "node:assert/strict";
import { demoCatalog } from "../lib/planner/demo-catalog";
import { indexableExperiences, privateMetadata, publicMetadata, serializeJsonLd, siteOrigin, supportEmail, websiteGraph } from "../lib/seo/site";

test("public metadata uses one production origin for canonical and social URLs", () => {
  const metadata = publicMetadata("Creative date ideas", "Choose something thoughtful.", "/date-ideas");
  assert.deepEqual(metadata.title, { absolute: "Creative date ideas | A Date At las" });
  assert.equal(metadata.alternates?.canonical, "https://adateatlas.com/date-ideas");
  assert.equal(metadata.openGraph?.url, `${siteOrigin}/date-ideas`);
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(privateMetadata("My dates").alternates, undefined);
});

test("private screens remain noindex and preview pages cannot opt into indexing", () => {
  assert.deepEqual(privateMetadata("My dates").robots, { index: false, follow: false, nocache: true });
  const original = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(publicMetadata("Date ideas", "Ideas for two.", "/date-ideas").robots, { index: false, follow: true });
    process.env.VERCEL_ENV = "production";
    assert.deepEqual(publicMetadata("Date ideas", "Ideas for two.", "/date-ideas").robots, { index: true, follow: true });
    assert.deepEqual(publicMetadata("Explore", "Published experiences.", "/explore", false).robots, { index: false, follow: true });
  } finally {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  }
});

test("demo, unpublished and unverified experiences never enter search listings", () => {
  const published = { ...demoCatalog[0], id: "published", active: true, approved: true, demo: false, verifiedAt: "2026-11-04", sourceUrl: "https://example.com/venue" };
  const records = [published, { ...published, id: "inactive", active: false }, { ...published, id: "unapproved", approved: false }, { ...published, id: "demo", demo: true }, { ...published, id: "unverified", verifiedAt: null }, { ...published, id: "unsourced", sourceUrl: null }];
  assert.deepEqual(indexableExperiences(records).map((experience) => experience.id), ["published"]);
  assert.equal(indexableExperiences(demoCatalog).length, 0);
});

test("structured data cannot close its script tag and preserves the original text", () => {
  const data = { name: "</script><script>alert('venue')</script>", description: "Art & coffee <3" };
  const serialized = serializeJsonLd(data);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), data);
  assert.deepEqual(JSON.parse(serializeJsonLd(websiteGraph)), websiteGraph);
  assert.ok(!serializeJsonLd(websiteGraph).includes("AggregateRating"));
  const organization = websiteGraph["@graph"].find((item) => item["@type"] === "Organization");
  const website = websiteGraph["@graph"].find((item) => item["@type"] === "WebSite");
  assert.equal(organization?.name, "A Date At las");
  assert.equal(organization?.email, supportEmail);
  assert.equal(organization?.contactPoint?.email, "support@adateatlas.com");
  assert.equal(website?.url, "https://adateatlas.com");
  assert.deepEqual(website?.alternateName, ["adal", "adateatlas.com"]);
});
