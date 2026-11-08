import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { getFirebaseAdmin, getDatabase } from "../../lib/firebase/server";
import { membershipCheckout, membershipConfirm, membershipManage, membershipSummary, applyVerifiedMembership, billingSubscriptionKey } from "../../lib/server/membership-billing";
import { membershipWebhook } from "../../lib/server/membership-webhooks";
import { membershipSummarySchema, membershipRecordSchema } from "../../lib/membership/schema";
import type { VerifiedMembership } from "../../lib/server/billing-providers";

if (process.env.FIREBASE_PROJECT_ID !== "demo-date-atlas" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Billing integration checks only run against local demo emulators.");
const db = getDatabase();
const originalFetch = globalThis.fetch;
const accounts: { localId: string; idToken: string }[] = [];
const subscriptionIds = new Set<string>();
const paymentIds = new Set<string>();
const start = Date.now() - 60000;
const end = start + 30 * 86400000;
const startedAt = new Date(start).toISOString();
const endsAt = new Date(end).toISOString();
const plan = { plan_code: "PLN_emulator_only", domain: "test", amount: 500000, currency: "NGN", interval: "monthly", id: 123 };
const price = { id: "price_emulator_only", amount_type: "fixed", price_currency: "usd", price_amount: 500, is_archived: false, tax_behavior: "exclusive" };
const product = { id: "product_emulator_only", is_recurring: true, is_archived: false, recurring_interval: "month", recurring_interval_count: 1, prices: [price] };
let badPlan = false;
let transactionStatus = "success";
let transactionOwner = "";
let transactionDomain = "test";
let paystackStatus = "active";
let polarPaid = true;
let polarRefunded = false;
let polarOwner = "";
let polarCheckoutFailure: "validation" | "ambiguous" | null = null;
let initializeCalls = 0;
let polarCreateCalls = 0;
let providerCalls = 0;
let holdInitialize: { entered: () => void; released: Promise<void> } | null = null;
const paystackCheckouts = new Map<string, { uid: string; checkoutId: string; subscriptionId: string; customerId: string }>();
const polarCheckouts = new Map<string, { uid: string; checkoutId: string; subscriptionId: string; customerId: string; id: string }>();
function paystackTransaction(reference: string) {
  const checkout = paystackCheckouts.get(reference);
  assert.ok(checkout);
  return { id: 789, reference, domain: transactionDomain, status: transactionStatus, amount: 500000, currency: "NGN", paid_at: startedAt,
    customer: { id: 42, customer_code: checkout.customerId }, authorization: { authorization_code: "AUTH_emulator_only" }, plan: plan.plan_code,
    metadata: { uid: transactionOwner || checkout.uid, checkoutId: checkout.checkoutId } };
}
function paystackSubscription(checkout: { subscriptionId: string; customerId: string }) {
  return { subscription_code: checkout.subscriptionId, domain: "test", status: paystackStatus, amount: 500000, createdAt: startedAt,
    next_payment_date: endsAt, email_token: "emulator-only-token", customer: { customer_code: checkout.customerId }, authorization: { authorization_code: "AUTH_emulator_only" }, plan };
}
function polarSubscription(checkout: { uid: string; checkoutId: string; subscriptionId: string; customerId: string; id: string }) {
  return { id: checkout.subscriptionId, product_id: product.id, customer_id: checkout.customerId, amount: 500, currency: "usd", recurring_interval: "month", recurring_interval_count: 1,
    prices: [price], status: "active", cancel_at_period_end: false, current_period_start: startedAt, current_period_end: endsAt,
    customer: { external_id: polarOwner || checkout.uid }, metadata: { uid: polarOwner || checkout.uid, checkoutId: checkout.checkoutId }, checkout_id: checkout.id };
}
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (["127.0.0.1", "localhost"].includes(url.hostname)) return originalFetch(input, init);
  providerCalls++;
  if (url.hostname === "api.paystack.co") {
    let data: unknown;
    if (url.pathname === "/plan/PLN_emulator_only") data = { ...plan, amount: badPlan ? 100 : 500000 };
    else if (url.pathname === "/transaction/initialize") {
      initializeCalls++;
      const body = z.object({ reference: z.string(), metadata: z.object({ uid: z.string(), checkoutId: z.string() }), channels: z.array(z.string()) }).parse(JSON.parse(String(init?.body)));
      assert.deepEqual(body.channels, ["card"]);
      const subscriptionId = `SUB_${randomUUID().replaceAll("-", "")}`;
      subscriptionIds.add(subscriptionId); paymentIds.add(body.reference);
      paystackCheckouts.set(body.reference, { ...body.metadata, subscriptionId, customerId: `CUS_${subscriptionId.slice(4)}` });
      if (holdInitialize) { holdInitialize.entered(); await holdInitialize.released; }
      data = { reference: body.reference, authorization_url: `https://checkout.paystack.com/${body.reference}` };
    } else if (url.pathname.startsWith("/transaction/verify/")) {
      const reference = url.pathname.split("/").at(-1)!;
      data = paystackTransaction(reference);
    } else if (url.pathname === "/transaction/789") {
      const reference = [...paystackCheckouts.keys()][0];
      assert.ok(reference); data = { ...paystackTransaction(reference), status: "reversed" };
    } else if (url.pathname === "/refund/77" || url.pathname === "/refund") {
      const refund = { id: 77, domain: "test", currency: "NGN", status: "processed", amount: 500000, transaction: 789 };
      data = url.pathname === "/refund" ? [refund] : refund;
    } else if (url.pathname === "/subscription") {
      data = [...paystackCheckouts.values()].map(paystackSubscription);
    } else if (url.pathname.startsWith("/subscription/") && url.pathname.endsWith("/manage/link")) data = { link: `https://paystack.com/manage/subscriptions/emulator-only` };
    else if (url.pathname === "/subscription/disable") { paystackStatus = "non-renewing"; data = {}; }
    else if (url.pathname.startsWith("/subscription/")) {
      const id = url.pathname.split("/").at(-1);
      const checkout = [...paystackCheckouts.values()].find((row) => row.subscriptionId === id);
      assert.ok(checkout); data = paystackSubscription(checkout);
    } else throw new Error(`Unexpected Paystack fixture path: ${url.pathname}`);
    return Response.json({ status: true, data });
  }
  if (url.hostname === "sandbox-api.polar.sh") {
    if (url.pathname === "/v1/products/product_emulator_only") return Response.json(product);
    if (url.pathname === "/v1/checkouts/" && init?.method === "POST") {
      polarCreateCalls++;
      if (polarCheckoutFailure === "validation") return Response.json({ detail: [{ loc: ["body", "customer_email"], msg: "Invalid billing email", type: "value_error" }] }, { status: 422 });
      const input = z.object({ external_customer_id: z.string(), metadata: z.object({ uid: z.string(), checkoutId: z.string() }) }).parse(JSON.parse(String(init.body)));
      const id = randomUUID(), subscriptionId = randomUUID(), customerId = randomUUID();
      const checkout = { ...input.metadata, id, subscriptionId, customerId };
      polarCheckouts.set(id, checkout); subscriptionIds.add(subscriptionId);
      return Response.json({ id, product_id: product.id, amount: 500, currency: "usd", url: polarCheckoutFailure === "ambiguous" ? `https://example.com/checkout/${id}` : `https://sandbox.polar.sh/checkout/${id}` });
    }
    if (url.pathname.startsWith("/v1/checkouts/")) {
      const checkout = polarCheckouts.get(url.pathname.split("/").at(-1)!);
      assert.ok(checkout);
      return Response.json({ id: checkout.id, status: "succeeded", subscription_id: checkout.subscriptionId, product_id: product.id, amount: 500, currency: "usd",
        external_customer_id: checkout.uid, customer_id: checkout.customerId, metadata: { uid: checkout.uid, checkoutId: checkout.checkoutId } });
    }
    if (url.pathname.startsWith("/v1/subscriptions/")) {
      const checkout = [...polarCheckouts.values()].find((row) => row.subscriptionId === url.pathname.split("/").at(-1));
      assert.ok(checkout); return Response.json(polarSubscription(checkout));
    }
    if (url.pathname === "/v1/orders/") {
      const checkout = [...polarCheckouts.values()].find((row) => row.subscriptionId === url.searchParams.get("subscription_id"));
      assert.ok(checkout);
      const id = `ORDER_${checkout.id}`; paymentIds.add(id);
      return Response.json({ items: [{ id, subscription_id: checkout.subscriptionId, customer_id: checkout.customerId, product_id: product.id, status: polarRefunded ? "refunded" : polarPaid ? "paid" : "pending", paid: polarPaid,
        currency: "usd", subtotal_amount: 500, net_amount: 500, tax_amount: 0, total_amount: 500, discount_amount: 0, applied_balance_amount: 0,
        refunded_amount: polarRefunded ? 500 : 0, refunded_tax_amount: 0, billing_reason: "subscription_create",
        items: [{ product_price_id: price.id, amount: 500, tax_amount: 0, proration: false, start_timestamp: startedAt, end_timestamp: endsAt }] }] });
    }
    throw new Error(`Unexpected Polar fixture path: ${url.pathname}`);
  }
  throw new Error(`External network is blocked in the billing emulator check: ${url.hostname}`);
};
async function account(email?: string) {
  const response = await originalFetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only-key", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true, ...(email ? { email, password: "Emulator-Only-Password-761!" } : {}) }) });
  assert.equal(response.status, 200);
  const value = z.object({ localId: z.string(), idToken: z.string() }).parse(await response.json());
  accounts.push(value); return value;
}
function req(value: unknown = {}, token?: string) {
  return new Request("http://localhost:3005/api/membership", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
}
function record(uid: string) { return db.collection("users").doc(uid).collection("membership").doc("current"); }
function checkoutRecord(uid: string) { return db.collection("users").doc(uid).collection("billingCheckout").doc("current"); }
const status = (code: number) => (error: unknown) => error instanceof Error && "status" in error && error.status === code;
try {
  const guest = await account();
  const member = await account(`billing-ng-${randomUUID()}@example.test`);
  const foreign = await account(`billing-global-${randomUUID()}@example.test`);
  const stranger = await account(`billing-other-${randomUUID()}@example.test`);
  assert.equal((await membershipSummary(req())).status, 401);
  const free = membershipSummarySchema.parse(await (await membershipSummary(req({}, guest.idToken))).json());
  assert.equal(free.tier, "free"); assert.equal(free.signedIn, false); assert.equal(free.plans.remaining, 1);
  assert.equal((await membershipCheckout(req({ country: "NG" }, guest.idToken))).status, 401);
  assert.equal((await membershipCheckout(req({ country: "ZZ" }, member.idToken))).status, 400);
  badPlan = true;
  assert.equal((await membershipCheckout(req({ country: "NG" }, member.idToken))).status, 503);
  assert.equal((await checkoutRecord(member.localId).get()).exists, false, "A known bad provider price must not leave a stuck checkout lease");
  badPlan = false;
  polarCheckoutFailure = "validation";
  assert.equal((await membershipCheckout(req({ country: "GB" }, foreign.idToken))).status, 422);
  assert.equal((await checkoutRecord(foreign.localId).get()).exists, false, "An explicit provider rejection leaves no checkout and releases the claim");
  polarCheckoutFailure = "ambiguous";
  assert.equal((await membershipCheckout(req({ country: "GB" }, foreign.idToken))).status, 503);
  assert.equal((await checkoutRecord(foreign.localId).get()).data()?.state, "creating", "An unverified response after creation must preserve the claim against duplicate charges");
  await checkoutRecord(foreign.localId).delete();
  polarCheckoutFailure = null;
  polarCreateCalls = 0;
  let entered!: () => void, release!: () => void;
  const initializing = new Promise<void>((resolve) => { entered = resolve; });
  holdInitialize = { entered, released: new Promise<void>((resolve) => { release = resolve; }) };
  const first = membershipCheckout(req({ country: "NG", provider: "polar", amount: 1 }, member.idToken));
  await initializing;
  const concurrent = await membershipCheckout(req({ country: "NG" }, member.idToken));
  assert.equal(concurrent.status, 409);
  release();
  assert.equal((await first).status, 200);
  holdInitialize = null;
  assert.equal(initializeCalls, 1, "Concurrent requests initialize one provider checkout");
  assert.equal(polarCreateCalls, 0, "The server chooses Paystack for NG regardless of client-supplied provider or price");
  assert.equal((await membershipCheckout(req({ country: "NG" }, member.idToken))).status, 200);
  assert.equal(initializeCalls, 1);
  assert.equal((await membershipCheckout(req({ country: "US" }, member.idToken))).status, 409);
  assert.equal(polarCreateCalls, 0, "An open checkout cannot be duplicated with the other provider");
  const checkout = z.object({ id: z.string() }).parse((await checkoutRecord(member.localId).get()).data());
  assert.equal((await record(member.localId).get()).exists, false, "Opening a checkout and returning to the page never activates Plus");
  assert.equal((await membershipConfirm(req({ checkoutId: checkout.id }, stranger.idToken))).status, 404);
  transactionStatus = "abandoned";
  assert.equal((await membershipConfirm(req({ checkoutId: checkout.id }, member.idToken))).status, 409);
  assert.equal((await record(member.localId).get()).exists, false);
  transactionStatus = "success"; transactionDomain = "live";
  assert.equal((await membershipConfirm(req({ checkoutId: checkout.id }, member.idToken))).status, 409);
  assert.equal((await record(member.localId).get()).exists, false, "A provider response from live mode cannot activate this test pilot");
  transactionDomain = "test";
  transactionStatus = "success"; transactionOwner = stranger.localId;
  assert.equal((await membershipConfirm(req({ checkoutId: checkout.id }, member.idToken))).status, 409);
  assert.equal((await record(member.localId).get()).exists, false, "A paid transaction belonging to another Firebase owner grants nothing");
  transactionOwner = "";
  assert.equal((await membershipConfirm(req({ checkoutId: checkout.id }, member.idToken))).status, 200);
  const confirmed = membershipRecordSchema.parse((await record(member.localId).get()).data());
  assert.equal((await membershipConfirm(req({ checkoutId: checkout.id }, member.idToken))).status, 200);
  assert.deepEqual(membershipRecordSchema.parse((await record(member.localId).get()).data()), confirmed, "Duplicate confirmation does not reset the paid period");
  const plus = membershipSummarySchema.parse(await (await membershipSummary(req({}, member.idToken))).json());
  assert.equal(plus.tier, "plus"); assert.equal(plus.plans.limit, 4); assert.equal(plus.changes.limit, 2); assert.equal(plus.provider, "paystack");
  assert.equal((await membershipCheckout(req({ country: "US" }, member.idToken))).status, 409);
  assert.equal((await membershipManage(req({}, member.idToken), "cancel")).status, 200);
  const canceled = membershipRecordSchema.parse((await record(member.localId).get()).data());
  assert.equal(canceled.cancelAtPeriodEnd, true); assert.equal(canceled.paidPeriodEnd, confirmed.paidPeriodEnd);
  assert.equal(membershipSummarySchema.parse(await (await membershipSummary(req({}, member.idToken))).json()).tier, "plus", "Canceling renewal keeps the paid allowance until the paid period ends");
  await applyVerifiedMembership(member.localId, { provider: "paystack", subscriptionId: confirmed.subscriptionId, customerId: confirmed.customerId, uid: member.localId,
    status: "active", periodStart: start, periodEnd: end, cancelAtPeriodEnd: false, paid: true, paymentId: checkout.id }, `stale_snapshot_${randomUUID()}`, confirmed.updatedAt - 1);
  assert.equal(membershipRecordSchema.parse((await record(member.localId).get()).data()).cancelAtPeriodEnd, true, "A provider lookup begun before cancellation cannot undo cancellation");
  const beforeWebhook = providerCalls;
  assert.equal((await membershipWebhook(new Request("http://localhost/hook", { method: "POST", body: '{"event":"charge.success","data":{}}' }), "paystack")).status, 401);
  assert.equal(providerCalls, beforeWebhook, "Invalid signatures never trigger provider requests");
  const canceledBody = JSON.stringify({ event: "subscription.not_renew", data: { subscription_code: confirmed.subscriptionId } });
  const canceledSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(canceledBody).digest("hex");
  assert.equal((await membershipWebhook(new Request("http://localhost/hook", { method: "POST", headers: { "x-paystack-signature": canceledSignature }, body: canceledBody }), "paystack")).status, 200);
  assert.equal(membershipSummarySchema.parse(await (await membershipSummary(req({}, member.idToken))).json()).tier, "plus");
  const refundBody = JSON.stringify({ event: "refund.processed", data: { id: 77 } });
  const refundSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(refundBody).digest("hex");
  for (let index = 0; index < 2; index++) assert.equal((await membershipWebhook(new Request("http://localhost/hook", { method: "POST", headers: { "x-paystack-signature": refundSignature }, body: refundBody }), "paystack")).status, 200);
  assert.equal(membershipRecordSchema.parse((await record(member.localId).get()).data()).status, "revoked", "A verified full refund revokes only its bound paid period, idempotently");

  assert.equal((await membershipCheckout(req({ country: "GB" }, foreign.idToken))).status, 200);
  assert.equal(polarCreateCalls, 1, "Non-Nigerian billing countries choose Polar");
  const globalCheckout = z.object({ id: z.string() }).parse((await checkoutRecord(foreign.localId).get()).data());
  polarPaid = false;
  assert.equal((await membershipConfirm(req({ checkoutId: globalCheckout.id }, foreign.idToken))).status, 409);
  assert.equal((await record(foreign.localId).get()).exists, false, "An active Polar subscription with an unpaid order grants no allowance");
  polarPaid = true; polarOwner = stranger.localId;
  assert.equal((await membershipConfirm(req({ checkoutId: globalCheckout.id }, foreign.idToken))).status, 409);
  polarOwner = "";
  assert.equal((await membershipConfirm(req({ checkoutId: globalCheckout.id }, foreign.idToken))).status, 200);
  assert.equal(membershipSummarySchema.parse(await (await membershipSummary(req({}, foreign.idToken))).json()).provider, "polar");
  const polarRow = [...polarCheckouts.values()].find((row) => row.checkoutId === globalCheckout.id);
  assert.ok(polarRow);
  polarRefunded = true;
  const polarBody = JSON.stringify({ type: "order.refunded", data: { subscription_id: polarRow.subscriptionId } });
  const polarTime = Math.floor(Date.now() / 1000).toString();
  const polarId = `event_${randomUUID()}`;
  const polarSignature = createHmac("sha256", process.env.POLAR_WEBHOOK_SECRET!).update(`${polarId}.${polarTime}.${polarBody}`).digest("base64");
  assert.equal((await membershipWebhook(new Request("http://localhost/hook", { method: "POST", headers: { "webhook-id": polarId, "webhook-timestamp": polarTime, "webhook-signature": `v1,${polarSignature}` }, body: polarBody }), "polar")).status, 200);
  assert.equal(membershipRecordSchema.parse((await record(foreign.localId).get()).data()).status, "revoked", "Polar refunds recheck the actual current-period order");

  const paid: VerifiedMembership = { provider: "polar", subscriptionId: `snapshot_${randomUUID()}`, customerId: `customer_${randomUUID()}`, uid: stranger.localId,
    status: "active", periodStart: start, periodEnd: end, cancelAtPeriodEnd: false, paid: true, paymentId: `payment_${randomUUID()}` };
  subscriptionIds.add(paid.subscriptionId); paymentIds.add(paid.paymentId!);
  await assert.rejects(applyVerifiedMembership(member.localId, paid, `wrongowner_${randomUUID()}`), status(409));
  await applyVerifiedMembership(stranger.localId, paid, `first_${randomUUID()}`);
  const beforeRevocation = membershipRecordSchema.parse((await record(stranger.localId).get()).data());
  await applyVerifiedMembership(stranger.localId, { ...paid, paid: false, revoked: true }, `refund_${randomUUID()}`);
  await applyVerifiedMembership(stranger.localId, paid, `stale_paid_${randomUUID()}`);
  const revoked = membershipRecordSchema.parse((await record(stranger.localId).get()).data());
  assert.equal(revoked.status, "revoked", "A delayed paid event for an already-refunded period cannot reactivate access");
  assert.equal(revoked.paidPeriodEnd, beforeRevocation.paidPeriodEnd);
  process.env.DATE_ATLAS_BILLING_MODE = "off";
  assert.equal((await membershipSummary(req({}, member.idToken))).status, 503);
  assert.equal((await membershipCheckout(req({ country: "NG" }, member.idToken))).status, 503);
  console.log("Membership billing integration checks passed: real emulator identities and transactions, regional provider routing, concurrent checkout safety, paid verification, webhook signatures, cancellation and stale refund replay.");
} finally {
  globalThis.fetch = originalFetch;
  process.env.DATE_ATLAS_BILLING_MODE = "test";
  for (const identity of accounts) await db.recursiveDelete(db.collection("users").doc(identity.localId));
  for (const provider of ["paystack", "polar"] as const) {
    for (const id of subscriptionIds) await db.collection("billingSubscriptions").doc(billingSubscriptionKey(provider, id)).delete();
    for (const id of paymentIds) await db.collection("billingPayments").doc(billingSubscriptionKey(provider, id)).delete();
  }
  await getAuth(getFirebaseAdmin()).deleteUsers(accounts.map((identity) => identity.localId));
}
