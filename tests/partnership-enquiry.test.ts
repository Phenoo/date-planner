import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { partnershipEnquiryMessage, partnershipEnquirySchema, partnershipIdempotencyKey } from "../lib/server/partnership-enquiry";

const validInput = {
  contactName: "Jamie Example",
  workEmail: "jamie@example.com",
  organization: "Example Gallery",
  partnershipType: "venue",
  cityCountry: "London, United Kingdom",
  proposal: "We run an independent art gallery and would like to discuss evening experiences for couples, with clearly published prices and booking information.",
  privacyAcknowledgement: true,
  honeypot: "",
};
const submissionId = "980026de-d315-4b23-b9fe-0f591b076202";

test("partnership enquiries require bounded business details and explicit privacy acknowledgement", () => {
  const input = partnershipEnquirySchema.parse({ ...validInput, contactName: "  Jamie Example  ", role: "  ", website: "  " });
  assert.equal(input.contactName, "Jamie Example");
  assert.equal(input.role, "");
  assert.equal(input.website, "");
  for (const partnershipType of ["venue", "experience", "brand", "other"]) {
    assert.equal(partnershipEnquirySchema.safeParse({ ...validInput, partnershipType }).success, true);
  }
  for (const proposal of ["a".repeat(80), "a".repeat(5000)]) {
    assert.equal(partnershipEnquirySchema.safeParse({ ...validInput, proposal }).success, true);
  }
  for (const input of [
    { ...validInput, contactName: " " },
    { ...validInput, contactName: "a".repeat(121) },
    { ...validInput, contactName: "Jamie\nExample" },
    { ...validInput, workEmail: "not-an-email" },
    { ...validInput, workEmail: "jamie@example.com\r\nBcc: another@example.com" },
    { ...validInput, organization: "a".repeat(161) },
    { ...validInput, role: "a".repeat(121) },
    { ...validInput, cityCountry: "a".repeat(161) },
    { ...validInput, partnershipType: "sponsor-everyone" },
    { ...validInput, proposal: "a".repeat(79) },
    { ...validInput, proposal: "a".repeat(5001) },
    { ...validInput, proposal: `${validInput.proposal}\u0000` },
    { ...validInput, privacyAcknowledgement: false },
    { ...validInput, privacyAcknowledgement: "true" },
    { ...validInput, honeypot: "a".repeat(201) },
    { ...validInput, recipient: "someone-else@example.com" },
  ]) {
    assert.equal(partnershipEnquirySchema.safeParse(input).success, false);
  }
});

test("partnership website validation only accepts complete HTTP URLs without credentials or controls", () => {
  for (const website of ["https://example.com/gallery?one=1&two=2", "http://example.com", "", undefined]) {
    assert.equal(partnershipEnquirySchema.safeParse({ ...validInput, website }).success, true);
  }
  for (const website of ["example.com", "//example.com", "javascript:alert(1)", "file:///etc/passwd", "ftp://example.com", "https://user:password@example.com", "https://example.com\nattacker", "https://example.com/a b", `https://example.com/${"a".repeat(2048)}`]) {
    assert.equal(partnershipEnquirySchema.safeParse({ ...validInput, website }).success, false);
  }
});

test("partnership emails go only to support, preserve reply-to and escape all applicant HTML", () => {
  const input = partnershipEnquirySchema.parse({
    ...validInput,
    contactName: '<img src=x onerror="alert(1)">',
    organization: "Example & Company",
    role: "Owner's representative",
    website: "https://example.com/?one=1&two=2",
    proposal: `<script>alert('proposal')</script>\n${validInput.proposal}`,
  });
  const message = partnershipEnquiryMessage(input);
  assert.equal(message.from, "A Date At las <noreply@adateatlas.com>");
  assert.deepEqual(message.to, ["support@adateatlas.com"]);
  assert.equal(message.reply_to, "jamie@example.com");
  assert.equal(message.subject, "A Date At las — Venue partnership enquiry");
  assert.ok(message.text.includes(input.contactName));
  assert.ok(message.text.includes(input.proposal));
  assert.ok(!message.html.includes("<script>"));
  assert.ok(!message.html.includes("<img"));
  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(message.html, /Example &amp; Company/);
  assert.match(message.html, /Owner&#39;s representative/);
  assert.match(message.html, /one=1&amp;two=2/);
  assert.match(message.html, /&lt;\/script&gt;<br>/);
  assert.match(message.text, /Privacy notice acknowledged: Yes/);
});

test("partnership idempotency keys are stable for retries and change with edited content or a new submission", () => {
  const input = partnershipEnquirySchema.parse(validInput);
  const key = partnershipIdempotencyKey(input, submissionId);
  assert.equal(key, partnershipIdempotencyKey(partnershipEnquirySchema.parse({ ...validInput, contactName: "  Jamie Example  " }), submissionId));
  assert.equal(key, partnershipIdempotencyKey(input, submissionId.toUpperCase()));
  assert.notEqual(key, partnershipIdempotencyKey({ ...input, proposal: `${input.proposal} Updated.` }, submissionId));
  assert.notEqual(key, partnershipIdempotencyKey(input, "317a9f6d-b4d2-4fc2-9cfb-6d737f63bf92"));
  assert.match(key, /^partnership\/[a-f0-9-]+\/[a-f0-9]{64}$/);
  assert.ok(key.length <= 256);
  assert.ok(!key.includes(input.workEmail));
  assert.ok(!key.includes(input.organization));
});

type RouteHarness = Pick<typeof import("../app/api/partnerships/route"), "POST"> & {
  setLimitStatus: (status: number) => void;
  getLimitCalls: () => string[];
};

type RequestOptions = { origin?: string | null; url?: string; idempotencyKey?: string | null; contentType?: string };
function enquiryRequest(body: unknown = validInput, options: RequestOptions = {}) {
  const headers = new Headers({ "Content-Type": options.contentType ?? "application/json" });
  if (options.origin !== null) headers.set("Origin", options.origin ?? "https://adateatlas.com");
  if (options.idempotencyKey !== null) headers.set("Idempotency-Key", options.idempotencyKey ?? submissionId);
  return new Request(options.url ?? "https://adateatlas.com/api/partnerships", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

test("the partnership endpoint validates origin and inputs, limits sends and safely retries Resend", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "partnership-route-test-"));
  const previousKey = process.env.RESEND_API_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const providerRequests: { url: string; init: RequestInit }[] = [];
  let providerStatus = 200;
  let providerFails = false;
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init: RequestInit = {}) => {
    providerRequests.push({ url: String(url), init });
    if (providerFails) throw new Error("Provider detail that must not reach the applicant");
    return new Response('{"id":"mock-email-id"}', { status: providerStatus });
  });
  try {
    const output = join(directory, "route.mjs");
    await build({
      stdin: { contents: 'export { POST } from "./app/api/partnerships/route"; export { setLimitStatus, getLimitCalls } from "partnership-limit-mock";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
      plugins: [{
        name: "isolated-partnership-limits",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:@\/lib\/planner\/rate-limit|partnership-limit-mock)$/ }, () => ({ path: "partnership-limit-mock", namespace: "partnership-limit" }));
          plugin.onLoad({ filter: /.*/, namespace: "partnership-limit" }, () => ({
            contents: `import { RequestError } from "@/lib/planner/http";
              let limitStatus = 0; const calls = [];
              export function setLimitStatus(status) { limitStatus = status; }
              export function getLimitCalls() { return calls; }
              export async function enforcePlannerLimit(request, bucket) { calls.push(bucket); if (limitStatus) throw new RequestError("Please wait a minute and try again.", limitStatus); }`,
            loader: "js", resolveDir: process.cwd(),
          }));
        },
      }],
    });
    const { POST, setLimitStatus, getLimitCalls }: RouteHarness = await import(pathToFileURL(output).href);
    process.env.RESEND_API_KEY = "mock-sending-only-key";
    Object.assign(process.env, { NODE_ENV: "production" });

    await t.test("a valid enquiry sends one support email and keeps provider keys stable across retry", async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await POST(enquiryRequest());
        assert.equal(response.status, 202);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.deepEqual(await response.json(), { accepted: true });
      }
      assert.equal(providerRequests.length, 2);
      const first = providerRequests[0];
      assert.equal(first.url, "https://api.resend.com/emails");
      assert.equal(first.init.method, "POST");
      assert.equal(new Headers(first.init.headers).get("Authorization"), "Bearer mock-sending-only-key");
      assert.equal(new Headers(first.init.headers).get("Idempotency-Key"), new Headers(providerRequests[1].init.headers).get("Idempotency-Key"));
      assert.equal(first.init.body, providerRequests[1].init.body);
      assert.deepEqual(JSON.parse(String(first.init.body)), partnershipEnquiryMessage(partnershipEnquirySchema.parse(validInput)));
      assert.ok(first.init.signal instanceof AbortSignal);
      assert.deepEqual(getLimitCalls(), ["partnership", "partnership"]);
    });

    await t.test("foreign, missing and production localhost origins cannot send enquiries", async () => {
      const before = providerRequests.length;
      for (const origin of ["https://attacker.example", "https://adateatlas.com.attacker.example", null, "null", "http://localhost:3000"]) {
        const response = await POST(enquiryRequest(validInput, { origin }));
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
      }
      assert.equal(providerRequests.length, before);
    });

    await t.test("development allows only the matching local app origin", async () => {
      Object.assign(process.env, { NODE_ENV: "development" });
      assert.equal((await POST(enquiryRequest(validInput, { origin: "http://localhost:3000", url: "http://localhost:3000/api/partnerships" }))).status, 202);
      assert.equal((await POST(enquiryRequest(validInput, { origin: "http://localhost:3001", url: "http://localhost:3000/api/partnerships" }))).status, 403);
      assert.equal((await POST(enquiryRequest(validInput, { origin: "https://attacker.example", url: "https://attacker.example/api/partnerships" }))).status, 403);
      Object.assign(process.env, { NODE_ENV: "production" });
    });

    await t.test("invalid JSON, oversized requests, missing identifiers and invalid fields never send", async () => {
      const before = providerRequests.length;
      for (const request of [
        enquiryRequest("{"),
        enquiryRequest(validInput, { contentType: "text/plain" }),
        enquiryRequest(validInput, { idempotencyKey: null }),
        enquiryRequest(validInput, { idempotencyKey: "not-a-uuid" }),
        enquiryRequest({ ...validInput, proposal: "too short" }),
        enquiryRequest({ ...validInput, privacyAcknowledgement: false }),
        enquiryRequest({ ...validInput, recipient: "attacker@example.com" }),
      ]) {
        assert.equal((await POST(request)).status, 400);
      }
      assert.equal((await POST(enquiryRequest(" ".repeat(18001)))).status, 413);
      const invalidEmail = await POST(enquiryRequest({ ...validInput, workEmail: "invalid-private-input" }));
      assert.deepEqual(await invalidEmail.json(), { error: "Please enter a valid work email address." });
      assert.equal(providerRequests.length, before);
    });

    await t.test("a filled honeypot receives the same acceptance without a send or limiter write", async () => {
      const before = providerRequests.length;
      const limitBefore = getLimitCalls().length;
      const response = await POST(enquiryRequest({ ...validInput, honeypot: "automated-fill" }));
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { accepted: true });
      assert.equal(providerRequests.length, before);
      assert.equal(getLimitCalls().length, limitBefore);
    });

    await t.test("rate limiting and missing email configuration return actionable failures without sending", async () => {
      const before = providerRequests.length;
      setLimitStatus(429);
      assert.equal((await POST(enquiryRequest())).status, 429);
      setLimitStatus(0);
      delete process.env.RESEND_API_KEY;
      const response = await POST(enquiryRequest());
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Enquiries are temporarily unavailable. Please try again shortly." });
      process.env.RESEND_API_KEY = "mock-sending-only-key";
      assert.equal(providerRequests.length, before);
    });

    await t.test("provider errors never claim success or expose provider bodies, and retries keep their key", async () => {
      for (const status of [400, 401, 409, 429, 500]) {
        providerStatus = status;
        const response = await POST(enquiryRequest());
        assert.equal(response.status, status === 429 ? 429 : 503);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        const body = await response.text();
        assert.ok(!body.includes("mock-email-id"));
        assert.ok(!body.includes("accepted"));
      }
      providerFails = true;
      const failed = await POST(enquiryRequest());
      assert.equal(failed.status, 503);
      assert.ok(!(await failed.text()).includes("Provider detail"));
      providerFails = false;
      providerStatus = 200;
      assert.equal((await POST(enquiryRequest())).status, 202);
      assert.equal(new Headers(providerRequests.at(-1)?.init.headers).get("Idempotency-Key"), new Headers(providerRequests.at(-2)?.init.headers).get("Idempotency-Key"));
      assert.deepEqual(logs, []);
    });
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    await rm(directory, { recursive: true, force: true });
  }
});
