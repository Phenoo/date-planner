import test from "node:test";
import assert from "node:assert/strict";
import { brandEmail } from "../lib/email/brand-template";
import { dateCreatedEmail } from "../lib/email/date-created";

test("brand emails escape every dynamic field and preserve multiline plain text", () => {
  const hostile = '<img src=x onerror="alert(1)"> & \'quote\'';
  const input = {
    preheader: hostile, eyebrow: hostile, title: hostile, paragraphs: [`First line\n${hostile}`],
    facts: [{ label: hostile, value: `Second line\r\n${hostile}` }],
    primaryAction: { label: hostile, url: "https://adateatlas.com/auth/action?mode=signIn&oobCode=fixture-code" },
    secondaryAction: { label: hostile, url: "https://adateatlas.com/saved" }, note: hostile,
  };
  const content = brandEmail(input);
  assert.ok(!content.html.includes("<img"));
  assert.ok(content.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quote&#39;"));
  assert.ok(content.html.includes("First line<br />&lt;img"));
  assert.ok(content.html.includes("Second line<br />&lt;img"));
  assert.ok(content.text.includes(`First line\n${hostile}`));
  assert.ok(content.text.includes(`Second line\r\n${hostile}`));
  assert.ok(content.html.includes("mode=signIn&amp;oobCode=fixture-code"));
  assert.match(content.html, /<html lang="en" dir="ltr"/);
  assert.match(content.html, /<body lang="en" dir="ltr"/);
  assert.match(content.html, /<table lang="en" dir="ltr"/);
  assert.match(content.html, /mso-hide:all/);
  assert.match(content.html, /\[if mso\]/);
  assert.match(content.html, /Arial,Helvetica,sans-serif/);
  assert.deepEqual(content, brandEmail(input), "Rendering the same input stays deterministic");
  for (const match of content.html.matchAll(/href="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"));
    assert.equal(url.origin, "https://adateatlas.com");
    assert.equal(url.protocol, "https:");
  }
});

test("email buttons reject insecure, misleading or noncanonical destinations", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,fixture", "http://adateatlas.com/saved", "https://adateatlas.com.attacker.example/saved", "https://attacker.example/", "https://user:password@adateatlas.com/saved", "https://www.adateatlas.com/saved", "/saved", "//adateatlas.com/saved"]) {
    for (const action of ["primaryAction", "secondaryAction"] as const) assert.throws(() => brandEmail({ preheader: "Fixture", title: "Fixture", [action]: { label: "Continue", url } }));
  }
});

test("saved date email is a private confirmation with an escaped venue snapshot", () => {
  const input = { venueName: "Gallery <Fixture> & Co.", address: "12 Example Road\nLondon", scheduleLabel: "Saturday 7 November · 6:00 PM", dateTitle: "Our <evening>", city: "London" };
  const content = dateCreatedEmail(input);
  assert.equal(content.subject, "Your date is saved | A Date At las");
  for (const value of ["It feels like a date.", "Open my date", "https://adateatlas.com/saved", "not a booking confirmation", "Saturday 7 November", "A Date At las"]) {
    assert.ok(content.html.includes(value));
    assert.ok(content.text.includes(value));
  }
  assert.ok(content.html.includes("Gallery &lt;Fixture&gt; &amp; Co.<br />12 Example Road<br />London"));
  assert.ok(content.text.includes("Gallery <Fixture> & Co.\n12 Example Road\nLondon"));
  assert.ok(!content.html.includes("/invite/"));
  assert.ok(!content.text.includes("/invite/"));
  assert.doesNotMatch(content.html, /<img\b|<svg\b|<script\b|<iframe\b/);
  assert.deepEqual(content, dateCreatedEmail(input));
});

test("a shareable invitation appears only from an explicit validated public URL", () => {
  const input = { venueName: "Fixture venue", scheduleLabel: "Weekend · Time to decide together" };
  const invitationUrl = `https://adateatlas.com/invite/${"a".repeat(32)}`;
  const content = dateCreatedEmail({ ...input, invitationUrl });
  assert.ok(content.html.includes(invitationUrl));
  assert.ok(content.text.includes(invitationUrl));
  for (const url of ["https://attacker.example/invite/" + "a".repeat(32), "http://adateatlas.com/invite/" + "a".repeat(32), "https://user:password@adateatlas.com/invite/" + "a".repeat(32), "https://adateatlas.com/invite/short", invitationUrl + "?private=fixture", invitationUrl + "#fixture"]) assert.throws(() => dateCreatedEmail({ ...input, invitationUrl: url }));
});

test("Google venue attribution appears only for an explicitly attributed snapshot", () => {
  const input = { venueName: "Fixture venue", scheduleLabel: "Saturday · 6:00 PM" };
  const attribution = "Venue details from Google Maps.";
  for (const googleAttribution of [undefined, false]) {
    const content = dateCreatedEmail({ ...input, googleAttribution });
    assert.ok(!content.html.includes(attribution));
    assert.ok(!content.text.includes(attribution));
  }
  const content = dateCreatedEmail({ ...input, googleAttribution: true });
  assert.ok(content.html.includes(`${attribution}<br /><br />This is your saved plan`));
  assert.ok(content.text.includes(`${attribution}\n\nThis is your saved plan`));
});

test("long proposals and websites stay complete without becoming injected links or markup", () => {
  const proposal = "A considered proposal. ".repeat(300).slice(0, 5000);
  const website = `https://example.com/${"a".repeat(2028)}`;
  const content = brandEmail({ preheader: "Partnership enquiry", title: "A new conversation.", facts: [{ label: "Proposal", value: proposal }, { label: "Website", value: website }] });
  assert.ok(content.html.includes(proposal));
  assert.ok(content.text.includes(proposal));
  assert.ok(content.html.includes(website));
  assert.ok(content.text.includes(website));
  assert.ok(!content.html.includes(`href="${website}"`));
  assert.match(content.html, /overflow-wrap:anywhere;word-break:break-word/);
});
