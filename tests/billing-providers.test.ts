import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHmac } from "node:crypto";
import { build } from "esbuild";

const checkoutId = "4437bb45-1b59-47af-af3c-2b655c7a5a20";
const polarCheckoutId = "5527bb45-1b59-47af-af3c-2b655c7a5a20";
const uid = "test-billing-user";
const periodStart = "2026-11-08T18:00:00.000Z";
const periodEnd = "2026-12-08T18:00:00.000Z";
const plan = { plan_code: "PLN_test", domain: "test", amount: 500000, currency: "NGN", interval: "monthly", id: 123 };
const transaction = {
  id: 987, reference: checkoutId, domain: "test", status: "success", amount: 500000, currency: "NGN", paid_at: periodStart,
  customer: { id: 42, customer_code: "CUS_test" }, authorization: { authorization_code: "AUTH_test" }, plan: "PLN_test", metadata: { uid, checkoutId },
};
const subscription = {
  subscription_code: "SUB_test", domain: "test", status: "active", amount: 500000,
  createdAt: periodStart, next_payment_date: periodEnd, email_token: "test-only-token", customer: { customer_code: "CUS_test" },
  authorization: { authorization_code: "AUTH_test" }, plan,
};
const price = { id: "price_test", amount_type: "fixed", price_currency: "usd", price_amount: 500, is_archived: false };
const product = { id: "product_test", is_recurring: true, is_archived: false, recurring_interval: "month", recurring_interval_count: 1, prices: [price] };
const polarSubscription = {
  id: "subscription_test", product_id: product.id, customer_id: "customer_test", amount: 500, currency: "usd",
  recurring_interval: "month", recurring_interval_count: 1, prices: [price], status: "active", cancel_at_period_end: false,
  current_period_start: periodStart, current_period_end: periodEnd, customer: { external_id: uid }, metadata: { uid, checkoutId },
};
const polarOrder = {
  id: "order_test", subscription_id: polarSubscription.id, customer_id: "customer_test", product_id: product.id, status: "paid", paid: true,
  currency: "usd", subtotal_amount: 500, net_amount: 500, refunded_amount: 0, refunded_tax_amount: 0, billing_reason: "subscription_create",
  items: [{ product_price_id: price.id, amount: 500, proration: false, start_timestamp: periodStart, end_timestamp: periodEnd }],
};

test("billing adapters use validated sandbox prices and require paid, owner-bound provider evidence", async (context) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "billing-provider-test-"));
  const output = join(directory, "providers.mjs");
  await build({ entryPoints: ["lib/server/billing-providers.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
    alias: { "server-only": "./scripts/empty-server-only.mjs" }, logLevel: "silent" });
  const api: typeof import("../lib/server/billing-providers") = await import(pathToFileURL(output).href);
  const variables = { DATE_ATLAS_BILLING_MODE: "test", FIREBASE_PROJECT_ID: "demo-date-atlas", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", VERCEL_ENV: "preview", DATE_ATLAS_FUNCTIONS_URL: "",
    PAYSTACK_SECRET_KEY: "sk_test_test-only-key", PAYSTACK_PLUS_MONTHLY_PLAN: plan.plan_code, POLAR_ACCESS_TOKEN: "polar_test_only_token", POLAR_PLUS_MONTHLY_PRODUCT: product.id,
    POLAR_WEBHOOK_SECRET: `whsec_${Buffer.from("a test webhook secret with enough bytes").toString("base64")}` };
  const previous = new Map(Object.keys(variables).map((key) => [key, process.env[key]]));
  Object.assign(process.env, variables);
  const originalFetch = globalThis.fetch;
  let routes = new Map<string, unknown>();
  let calls: { url: URL; body: unknown; method: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null, method: init?.method ?? "GET" });
    assert.ok(["api.paystack.co", "sandbox-api.polar.sh"].includes(url.hostname));
    const value = routes.get(url.pathname);
    assert.notEqual(value, undefined, `Unexpected provider request: ${url.pathname}`);
    return Response.json(url.hostname === "api.paystack.co" ? { status: true, data: value } : value);
  };
  const checkoutInput = { uid, email: "test@example.com", checkoutId, returnUrl: `http://localhost:3004/membership?checkout=${checkoutId}` };
  try {
    await context.test("Paystack initializes one server-priced card subscription with durable metadata", async () => {
      routes = new Map<string, unknown>([["/plan/PLN_test", plan], ["/transaction/initialize", { reference: checkoutId, authorization_url: "https://checkout.paystack.com/test" }]]);
      calls = [];
      assert.deepEqual(await api.initializeProviderCheckout({ ...checkoutInput, provider: "paystack" }), { id: checkoutId, url: "https://checkout.paystack.com/test" });
      assert.equal(calls[1].method, "POST");
      assert.deepEqual(calls[1].body, { email: checkoutInput.email, amount: 500000, currency: "NGN", plan: "PLN_test", reference: checkoutId,
        callback_url: checkoutInput.returnUrl, channels: ["card"], metadata: { uid, checkoutId } });
      routes.set("/plan/PLN_test", { ...plan, amount: 100 });
      calls = [];
      await assert.rejects(api.initializeProviderCheckout({ ...checkoutInput, provider: "paystack" }));
      assert.equal(calls.length, 1);
    });
    await context.test("Provider preflight validates configuration without creating a hosted checkout", async () => {
      routes = new Map<string, unknown>([["/plan/PLN_test", plan], ["/v1/products/product_test", product]]);
      calls = [];
      await api.validateProviderConfig("paystack");
      await api.validateProviderConfig("polar");
      assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
    });
    await context.test("Paystack callback independently proves payment and an unambiguous subscription", async () => {
      routes = new Map<string, unknown>([[`/transaction/verify/${checkoutId}`, transaction], ["/plan/PLN_test", plan], ["/subscription", [subscription]], ["/subscription/SUB_test", subscription]]);
      const result = await api.verifyProviderCheckout("paystack", checkoutId);
      assert.equal(result.paid, true);
      assert.equal(result.uid, uid);
      assert.equal(result.checkoutId, checkoutId);
      assert.equal(result.paymentId, transaction.reference);
      assert.equal(result.periodEnd, Date.parse(periodEnd));
      for (const invalid of [{ ...transaction, domain: "live" }, { ...transaction, amount: 10 }, { ...transaction, status: "abandoned" }, { ...transaction, reference: "different_reference" }, { ...transaction, metadata: null }]) {
        routes.set(`/transaction/verify/${checkoutId}`, invalid);
        await assert.rejects(api.verifyProviderCheckout("paystack", checkoutId));
      }
      routes.set(`/transaction/verify/${checkoutId}`, transaction);
      routes.set("/subscription", [subscription, subscription]);
      await assert.rejects(api.verifyProviderCheckout("paystack", checkoutId));
    });
    await context.test("Paystack active state alone never extends paid access; invoices verify their underlying charge", async () => {
      routes = new Map<string, unknown>([["/subscription/SUB_test", subscription]]);
      assert.equal((await api.fetchProviderSubscription("paystack", "SUB_test")).paid, false);
      const invoice = { domain: "test", amount: 500000, paid: true, period_start: periodStart, period_end: periodEnd, transaction: 987 };
      routes.set("/subscription/SUB_test", { ...subscription, most_recent_invoice: invoice });
      routes.set("/transaction/987", transaction);
      assert.equal((await api.fetchProviderSubscription("paystack", "SUB_test")).paid, true);
      routes.set("/transaction/987", { ...transaction, customer: { id: 98, customer_code: "CUS_someone_else" } });
      await assert.rejects(api.fetchProviderSubscription("paystack", "SUB_test"));
    });
    await context.test("Paystack refund totals are independently verified and bound to the original payment", async () => {
      const refund = { id: 77, domain: "test", currency: "NGN", status: "processed", amount: 250000, transaction: transaction.id };
      routes = new Map<string, unknown>([["/refund/77", refund], ["/transaction/987", { ...transaction, status: "reversed" }],
        ["/refund", [refund, { ...refund, id: 78 }, refund, { ...refund, id: 79, status: "pending" }]]]);
      const result = await api.verifyPaystackRefund({ id: 77 });
      assert.equal(result.refundedAmount, 500000);
      assert.equal(result.originalAmount, 500000);
      assert.equal(result.paymentId, transaction.reference);
      assert.equal(result.processed, true);
      routes.set("/refund/77", { ...refund, domain: "live" });
      await assert.rejects(api.verifyPaystackRefund({ id: 77 }));
      routes.set("/refund/77", refund);
      routes.set("/transaction/987", { ...transaction, id: 123 });
      await assert.rejects(api.verifyPaystackRefund({ id: 77 }));
    });
    await context.test("Polar uses the sandbox SDK and only the configured monthly five-dollar product", async () => {
      routes = new Map<string, unknown>([["/v1/products/product_test", product], ["/v1/checkouts/", { id: polarCheckoutId, product_id: product.id, amount: 500, currency: "usd", url: "https://sandbox.polar.sh/checkout/test" }]]);
      calls = [];
      assert.equal((await api.initializeProviderCheckout({ ...checkoutInput, provider: "polar" })).id, polarCheckoutId);
      const posted = calls[1].body;
      assert.ok(posted && typeof posted === "object" && "external_customer_id" in posted && posted.external_customer_id === uid);
      assert.ok(posted && typeof posted === "object" && "allow_trial" in posted && posted.allow_trial === false);
      routes.set("/v1/products/product_test", { ...product, recurring_interval: "year" });
      calls = [];
      await assert.rejects(api.initializeProviderCheckout({ ...checkoutInput, provider: "polar" }));
      assert.equal(calls.length, 1);
    });
    await context.test("Polar active, refunded and older-period orders cannot grant this month's allowance", async () => {
      routes = new Map<string, unknown>([["/v1/subscriptions/subscription_test", polarSubscription], ["/v1/orders/", { items: [polarOrder] }]]);
      assert.equal((await api.fetchProviderSubscription("polar", "subscription_test")).paid, true);
      for (const invalid of [{ ...polarOrder, paid: false }, { ...polarOrder, status: "refunded", refunded_amount: 500 }, { ...polarOrder, customer_id: "someone_else" },
        { ...polarOrder, items: [{ ...polarOrder.items[0], start_timestamp: "2026-10-08T18:00:00.000Z", end_timestamp: periodStart }] }]) {
        routes.set("/v1/orders/", { items: [invalid] });
        assert.equal((await api.fetchProviderSubscription("polar", "subscription_test")).paid, false);
      }
      routes.set("/v1/orders/", { items: [{ ...polarOrder, status: "refunded", refunded_amount: 500 }] });
      assert.equal((await api.fetchProviderSubscription("polar", "subscription_test")).revoked, true);
    });
    await context.test("Polar callback requires a successful paid checkout and matching Firebase owner", async () => {
      const checkout = { id: polarCheckoutId, status: "succeeded", subscription_id: polarSubscription.id, product_id: product.id, amount: 500, currency: "usd",
        external_customer_id: uid, customer_id: "customer_test", metadata: { uid, checkoutId } };
      routes = new Map<string, unknown>([[`/v1/checkouts/${polarCheckoutId}`, checkout], ["/v1/subscriptions/subscription_test", polarSubscription], ["/v1/orders/", { items: [polarOrder] }]]);
      assert.equal((await api.verifyProviderCheckout("polar", polarCheckoutId)).uid, uid);
      routes.set(`/v1/checkouts/${polarCheckoutId}`, { ...checkout, external_customer_id: "someone_else" });
      await assert.rejects(api.verifyProviderCheckout("polar", polarCheckoutId));
      routes.set(`/v1/checkouts/${polarCheckoutId}`, { ...checkout, status: "confirmed" });
      await assert.rejects(api.verifyProviderCheckout("polar", polarCheckoutId));
    });
    await context.test("Portal and cancel operate only on the stored provider owner", async () => {
      const input = { provider: "paystack" as const, subscriptionId: "SUB_test", customerId: "CUS_test", returnUrl: checkoutInput.returnUrl };
      routes = new Map<string, unknown>([["/subscription/SUB_test", subscription], ["/subscription/SUB_test/manage/link", { link: "https://paystack.com/manage/subscriptions/test" }], ["/subscription/disable", {}]]);
      assert.match(await api.providerPortal(input), /^https:\/\/paystack.com\/manage\/subscriptions\//);
      await api.cancelProviderSubscription(input);
      await assert.rejects(api.providerPortal({ ...input, customerId: "CUS_someone_else" }));
      routes.set("/subscription/SUB_test", { ...subscription, amount: 600000 });
      await api.cancelProviderSubscription(input);
      await assert.rejects(api.fetchProviderSubscription("paystack", "SUB_test"));
      routes.set("/subscription/SUB_test/manage/link", { link: "https://attacker.example/payment" });
      await assert.rejects(api.providerPortal(input));
    });
    await context.test("Polar webhook SDK verifies exact signed bytes and timestamp", async () => {
      const raw = Buffer.from(JSON.stringify({ type: "subscription.updated", data: { id: "subscription_test" } }));
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = Buffer.from(variables.POLAR_WEBHOOK_SECRET.slice(6), "base64");
      const signature = createHmac("sha256", secret).update(`event_test.${timestamp}.`).update(raw).digest("base64");
      const headers = new Headers({ "webhook-id": "event_test", "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` });
      assert.equal((await api.verifyPolarWebhook(raw, headers)).type, "subscription.updated");
      await assert.rejects(api.verifyPolarWebhook(Buffer.from(`${raw.toString()} `), headers));
      headers.set("webhook-timestamp", (Number(timestamp) - 301).toString());
      await assert.rejects(api.verifyPolarWebhook(raw, headers));
      const unknown = Buffer.from(JSON.stringify({ type: "new.event", data: {} }));
      headers.set("webhook-timestamp", timestamp);
      headers.set("webhook-signature", `v1,${createHmac("sha256", secret).update(`event_test.${timestamp}.`).update(unknown).digest("base64")}`);
      assert.equal((await api.verifyPolarWebhook(unknown, headers)).type, "unhandled");
    });
    await context.test("Live keys and production Firebase never trigger a provider request", async () => {
      calls = [];
      process.env.PAYSTACK_SECRET_KEY = "sk_live_never_allowed";
      await assert.rejects(api.verifyPaystackTransaction(checkoutId));
      assert.equal(calls.length, 0);
      process.env.FIREBASE_PROJECT_ID = "production-project";
      await assert.rejects(api.fetchProviderSubscription("polar", "subscription_test"));
      assert.equal(calls.length, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});
