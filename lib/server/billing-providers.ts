import "server-only";
import { createPolar, webhooks, type models } from "@polar-sh/sdk/2026-10";
import { z } from "zod";
import { RequestError } from "@/lib/planner/http";
import type { MembershipProvider } from "@/lib/membership/schema";
import { requireMembershipTest } from "./membership-config";

export interface VerifiedMembership {
  provider: MembershipProvider;
  subscriptionId: string;
  customerId: string;
  uid?: string;
  checkoutId?: string;
  status: "active" | "past_due" | "canceled";
  periodStart: number;
  periodEnd: number;
  cancelAtPeriodEnd: boolean;
  paid: boolean;
  revoked?: boolean;
  paymentId?: string;
}
type CheckoutInput = { provider: MembershipProvider; uid: string; email: string; checkoutId: string; returnUrl: string };
type SubscriptionInput = { provider: MembershipProvider; customerId: string; subscriptionId: string; returnUrl: string };
const unavailable = () => new RequestError("Subscription services are temporarily unavailable. Please try again.", 503);
const pending = () => new RequestError("Your payment is still being confirmed. Refresh your membership shortly.", 409);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const metadataSchema = z.object({ uid: z.string().min(1).max(128), checkoutId: z.uuid() });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw unavailable();
  return value;
}
function timestamp(value: string) {
  const result = Date.parse(value);
  if (!Number.isFinite(result) || result < 0) throw unavailable();
  return result;
}
function monthlyPeriod(start: number, end: number) {
  const days = (end - start) / 86400000;
  if (!Number.isFinite(days) || days < 20 || days > 32) throw unavailable();
}
function hostedUrl(value: string, provider: MembershipProvider, portal = false) {
  const url = new URL(value);
  const allowed = provider === "polar" ? url.hostname === "sandbox.polar.sh"
    : portal ? url.hostname === "paystack.com" && url.pathname.startsWith("/manage/subscriptions/") : url.hostname === "checkout.paystack.com";
  if (!allowed || url.protocol !== "https:" || url.username || url.password || url.port) throw unavailable();
  return url.href;
}
function returnUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
    || url.protocol === "https:" && url.hostname.endsWith(".vercel.app"))) throw unavailable();
  return url.href;
}
function paystackKey() {
  requireMembershipTest();
  const key = required("PAYSTACK_SECRET_KEY");
  if (!key.startsWith("sk_test_")) throw unavailable();
  return key;
}
async function paystack(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${paystackKey()}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw unavailable();
  const envelope = z.object({ status: z.literal(true), data: z.unknown().optional() }).safeParse(await response.json());
  if (!envelope.success) throw unavailable();
  return envelope.data.data;
}
function polar() {
  requireMembershipTest();
  return createPolar({ accessToken: required("POLAR_ACCESS_TOKEN"), environment: "sandbox", timeout: 15 });
}
const paystackPlanSchema = z.object({ plan_code: identifier, domain: z.literal("test"), amount: z.literal(500000), currency: z.literal("NGN"), interval: z.literal("monthly"), id: z.number().int().optional() });
async function paystackPlan() {
  const code = identifier.parse(required("PAYSTACK_PLUS_MONTHLY_PLAN"));
  const plan = paystackPlanSchema.parse(await paystack(`/plan/${encodeURIComponent(code)}`));
  if (plan.plan_code !== code) throw unavailable();
  return plan;
}
function validPolarPrice(price: models.ProductPrice | models.LegacyRecurringProductPrice) {
  return price.amount_type === "fixed" && price.price_amount === 500 && price.price_currency === "usd" && !price.is_archived;
}
async function polarProduct() {
  const id = identifier.parse(required("POLAR_PLUS_MONTHLY_PRODUCT"));
  const product = await polar().products.get(id);
  if (product.id !== id || !product.is_recurring || product.is_archived || product.recurring_interval !== "month"
    || product.recurring_interval_count !== 1 || product.prices.length !== 1 || !validPolarPrice(product.prices[0])) throw unavailable();
  return product;
}

export async function validateProviderConfig(provider: MembershipProvider) {
  requireMembershipTest();
  if (provider === "paystack") await paystackPlan();
  else await polarProduct();
}

export async function initializeProviderCheckout(input: CheckoutInput): Promise<{ id: string; url: string }> {
  requireMembershipTest();
  const metadata = metadataSchema.parse({ uid: input.uid, checkoutId: input.checkoutId });
  const email = z.email().parse(input.email);
  const callback = returnUrl(input.returnUrl);
  if (input.provider === "paystack") {
    const plan = await paystackPlan();
    const checkout = z.object({ reference: identifier, authorization_url: z.url() }).parse(await paystack("/transaction/initialize", {
      email, amount: 500000, currency: "NGN", plan: plan.plan_code, reference: input.checkoutId,
      callback_url: callback, channels: ["card"], metadata,
    }));
    if (checkout.reference !== input.checkoutId) throw unavailable();
    return { id: checkout.reference, url: hostedUrl(checkout.authorization_url, "paystack") };
  }
  const product = await polarProduct();
  const checkout = await polar().checkouts.create({ products: [product.id], external_customer_id: input.uid, customer_email: email,
    metadata, success_url: callback, return_url: callback, allow_discount_codes: false, allow_trial: false, currency: "usd" });
  if (checkout.product_id !== product.id || checkout.amount !== 500 || checkout.currency !== "usd") throw unavailable();
  return { id: checkout.id, url: hostedUrl(checkout.url, "polar") };
}

const transactionSchema = z.object({
  id: z.number().int().optional(), reference: identifier, domain: z.literal("test"), status: z.literal("success"),
  amount: z.literal(500000), currency: z.literal("NGN"), paid_at: z.string(),
  customer: z.object({ id: z.number().int(), customer_code: identifier }),
  authorization: z.object({ authorization_code: identifier }),
  plan: z.union([z.string(), z.object({ plan_code: identifier }), z.null()]).optional(),
  plan_object: z.object({ plan_code: identifier }).nullable().optional(), metadata: z.unknown(),
});
type PaystackTransaction = z.infer<typeof transactionSchema>;
async function paidPaystackTransaction(path: string): Promise<PaystackTransaction> {
  const parsed = transactionSchema.safeParse(await paystack(path));
  if (!parsed.success) throw pending();
  const transaction = parsed.data;
  const code = typeof transaction.plan === "string" ? transaction.plan : transaction.plan?.plan_code ?? transaction.plan_object?.plan_code;
  if (code !== required("PAYSTACK_PLUS_MONTHLY_PLAN")) throw unavailable();
  timestamp(transaction.paid_at);
  return transaction;
}
export async function verifyPaystackTransaction(reference: string) {
  identifier.parse(reference);
  const transaction = await paidPaystackTransaction(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (transaction.reference !== reference) throw unavailable();
  const metadata = metadataSchema.safeParse(transaction.metadata);
  if (!metadata.success) throw unavailable();
  return { reference, customerId: transaction.customer.customer_code, customerNumericId: transaction.customer.id,
    authorizationCode: transaction.authorization.authorization_code, paidAt: timestamp(transaction.paid_at), ...metadata.data };
}

const invoiceSchema = z.object({
  domain: z.literal("test"), amount: z.literal(500000), paid: z.union([z.literal(true), z.literal(1)]),
  period_start: z.string(), period_end: z.string(), transaction: z.union([z.number().int().positive(), z.object({ reference: identifier })]),
});
const subscriptionSchema = z.object({
  subscription_code: identifier, domain: z.literal("test"), status: z.string(), createdAt: z.string().optional(), created_at: z.string().optional(),
  next_payment_date: z.string().nullable(), email_token: z.string().optional(), amount: z.number().int().nonnegative(),
  customer: z.object({ customer_code: identifier }), plan: z.object({ plan_code: identifier, currency: z.string(), interval: z.string() }),
  authorization: z.object({ authorization_code: identifier }), most_recent_invoice: z.unknown().optional(),
});
type PaystackSubscription = z.infer<typeof subscriptionSchema>;
async function paystackSubscription(id: string, validatePrice = true) {
  const subscription = subscriptionSchema.parse(await paystack(`/subscription/${encodeURIComponent(identifier.parse(id))}`));
  if (subscription.subscription_code !== id) throw unavailable();
  if (validatePrice && (subscription.plan.plan_code !== required("PAYSTACK_PLUS_MONTHLY_PLAN") || subscription.amount !== 500000
    || subscription.plan.currency !== "NGN" || subscription.plan.interval !== "monthly")) throw unavailable();
  return subscription;
}
function paystackState(subscription: PaystackSubscription): VerifiedMembership {
  const canceled = ["cancelled", "completed", "complete", "non-renewing"].includes(subscription.status);
  return { provider: "paystack", subscriptionId: subscription.subscription_code, customerId: subscription.customer.customer_code,
    status: canceled ? "canceled" : subscription.status === "active" ? "active" : "past_due", cancelAtPeriodEnd: canceled,
    periodStart: 0, periodEnd: 0, paid: false };
}
async function paystackInvoiceMembership(subscription: PaystackSubscription, value: unknown): Promise<VerifiedMembership> {
  const invoice = invoiceSchema.parse(value);
  const transaction = await paidPaystackTransaction(typeof invoice.transaction === "number"
    ? `/transaction/${invoice.transaction}` : `/transaction/verify/${encodeURIComponent(invoice.transaction.reference)}`);
  if (transaction.customer.customer_code !== subscription.customer.customer_code || transaction.authorization.authorization_code !== subscription.authorization.authorization_code) throw unavailable();
  const start = timestamp(invoice.period_start), end = timestamp(invoice.period_end);
  monthlyPeriod(start, end);
  const paidAt = timestamp(transaction.paid_at);
  if (paidAt < start - 86400000 || paidAt >= end) throw unavailable();
  return { ...paystackState(subscription), periodStart: start, periodEnd: end, paid: true, paymentId: transaction.reference };
}

function validatePolarSubscription(subscription: models.Subscription) {
  if (subscription.product_id !== required("POLAR_PLUS_MONTHLY_PRODUCT") || subscription.amount !== 500 || subscription.currency !== "usd"
    || subscription.recurring_interval !== "month" || subscription.recurring_interval_count !== 1
    || subscription.prices.length !== 1 || !validPolarPrice(subscription.prices[0])) throw unavailable();
}
function polarOrderPeriodMatches(order: models.Order, subscription: models.Subscription) {
  const priceIds = new Set(subscription.prices.map((price) => price.id));
  return order.subscription_id === subscription.id && order.customer_id === subscription.customer_id && order.product_id === subscription.product_id
    && order.currency === "usd" && order.subtotal_amount === 500 && order.net_amount === 500
    && ["subscription_create", "subscription_cycle"].includes(order.billing_reason)
    && order.items.some((item) => item.product_price_id !== null && priceIds.has(item.product_price_id) && !item.proration && item.amount === 500
      && item.start_timestamp !== null && item.end_timestamp !== null
      && timestamp(item.start_timestamp) === timestamp(subscription.current_period_start) && timestamp(item.end_timestamp) === timestamp(subscription.current_period_end));
}
async function polarSubscription(id: string): Promise<VerifiedMembership> {
  const client = polar();
  const subscription = await client.subscriptions.get(identifier.parse(id));
  if (subscription.id !== id) throw unavailable();
  validatePolarSubscription(subscription);
  const start = timestamp(subscription.current_period_start), end = timestamp(subscription.current_period_end);
  monthlyPeriod(start, end);
  const orders = await client.orders.list({ subscription_id: id, limit: 10, sorting: ["-created_at"] });
  const periodOrders = orders.items.filter((order) => polarOrderPeriodMatches(order, subscription));
  const paidOrder = periodOrders.find((order) => order.paid && order.status === "paid" && order.refunded_amount === 0 && order.refunded_tax_amount === 0);
  const paid = !!paidOrder;
  const refunded = !paid && periodOrders.some((order) => order.status === "refunded" || order.refunded_amount >= order.net_amount);
  let metadata = metadataSchema.safeParse(subscription.metadata);
  const uid = subscription.customer.external_id ?? undefined;
  if (!metadata.success && subscription.checkout_id) {
    const checkout = await client.checkouts.get(subscription.checkout_id);
    if (checkout.subscription_id !== id || checkout.external_customer_id !== uid) throw unavailable();
    metadata = metadataSchema.safeParse(checkout.metadata);
  }
  if (!uid || metadata.success && metadata.data.uid !== uid) throw unavailable();
  return { provider: "polar", subscriptionId: id, customerId: subscription.customer_id, uid,
    ...(metadata.success ? { checkoutId: metadata.data.checkoutId } : {}),
    status: subscription.status === "active" ? "active" : subscription.status === "canceled" ? "canceled" : "past_due",
    periodStart: start, periodEnd: end, cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(paidOrder ? { paymentId: paidOrder.id } : {}),
    paid, revoked: refunded || ["unpaid", "incomplete_expired", "paused"].includes(subscription.status) || subscription.status === "canceled" && !subscription.cancel_at_period_end };
}

export async function fetchProviderSubscription(provider: MembershipProvider, id: string): Promise<VerifiedMembership> {
  requireMembershipTest();
  if (provider === "polar") return polarSubscription(id);
  const subscription = await paystackSubscription(id);
  if (invoiceSchema.safeParse(subscription.most_recent_invoice).success) return paystackInvoiceMembership(subscription, subscription.most_recent_invoice);
  return paystackState(subscription);
}

export async function verifyProviderCheckout(provider: MembershipProvider, id: string): Promise<VerifiedMembership> {
  requireMembershipTest();
  if (provider === "polar") {
    const checkout = await polar().checkouts.get(identifier.parse(id));
    const metadata = metadataSchema.parse(checkout.metadata);
    if (checkout.id !== id || checkout.status !== "succeeded" || !checkout.subscription_id) throw pending();
    if (checkout.product_id !== required("POLAR_PLUS_MONTHLY_PRODUCT") || checkout.amount !== 500 || checkout.currency !== "usd"
      || checkout.external_customer_id !== metadata.uid) throw unavailable();
    const result = await polarSubscription(checkout.subscription_id);
    if (!result.paid || result.uid !== metadata.uid || result.customerId !== checkout.customer_id) throw pending();
    return { ...result, ...metadata };
  }
  const transaction = await verifyPaystackTransaction(id);
  const plan = await paystackPlan();
  if (!plan.id) throw unavailable();
  const candidates = z.array(z.unknown()).parse(await paystack(`/subscription?customer=${transaction.customerNumericId}&plan=${plan.id}&perPage=100`));
  const matching = candidates.flatMap((candidate) => {
    const parsed = subscriptionSchema.safeParse(candidate);
    if (!parsed.success) return [];
    const subscription = parsed.data;
    const created = subscription.createdAt ?? subscription.created_at;
    return subscription.customer.customer_code === transaction.customerId && subscription.plan.plan_code === plan.plan_code
      && subscription.authorization.authorization_code === transaction.authorizationCode && created
      && Math.abs(timestamp(created) - transaction.paidAt) < 600000 ? [subscription] : [];
  });
  if (matching.length !== 1) throw pending();
  const subscription = await paystackSubscription(matching[0].subscription_code);
  if (invoiceSchema.safeParse(subscription.most_recent_invoice).success) {
    return { ...await paystackInvoiceMembership(subscription, subscription.most_recent_invoice), uid: transaction.uid, checkoutId: transaction.checkoutId };
  }
  const end = subscription.next_payment_date ? timestamp(subscription.next_payment_date) : 0;
  monthlyPeriod(transaction.paidAt, end);
  return { ...paystackState(subscription), uid: transaction.uid, checkoutId: transaction.checkoutId,
    periodStart: transaction.paidAt, periodEnd: end, paid: true, paymentId: transaction.reference };
}

export async function verifyPaystackInvoice(value: unknown): Promise<VerifiedMembership> {
  requireMembershipTest();
  const signed = z.object({ subscription: z.object({ subscription_code: identifier }) }).parse(value);
  const subscription = await paystackSubscription(signed.subscription.subscription_code);
  return paystackInvoiceMembership(subscription, value);
}

export async function verifyPaystackRefund(value: unknown) {
  requireMembershipTest();
  const input = z.object({ id: z.number().int().positive() }).parse(value);
  const refundSchema = z.object({ id: z.number().int().positive(), domain: z.literal("test"), currency: z.literal("NGN"),
    amount: z.number().int().positive(), status: z.string(), transaction: z.union([z.number().int().positive(), z.object({ id: z.number().int().positive() })]) });
  const refund = refundSchema.parse(await paystack(`/refund/${input.id}`));
  if (refund.id !== input.id) throw unavailable();
  const transactionId = typeof refund.transaction === "number" ? refund.transaction : refund.transaction.id;
  const transaction = transactionSchema.extend({ status: z.enum(["success", "reversed"]) }).parse(await paystack(`/transaction/${transactionId}`));
  const code = typeof transaction.plan === "string" ? transaction.plan : transaction.plan?.plan_code ?? transaction.plan_object?.plan_code;
  if (code !== required("PAYSTACK_PLUS_MONTHLY_PLAN") || transaction.id !== transactionId) throw unavailable();
  const refunds = z.array(refundSchema).parse(await paystack(`/refund?transaction=${transactionId}&perPage=100`));
  const seen = new Set<number>();
  const refundedAmount = refunds.reduce((sum, row) => {
    const rowTransaction = typeof row.transaction === "number" ? row.transaction : row.transaction.id;
    if (rowTransaction !== transactionId || row.status !== "processed" || seen.has(row.id)) return sum;
    seen.add(row.id);
    return sum + row.amount;
  }, 0);
  return { customerId: transaction.customer.customer_code, reference: transaction.reference, paymentId: transaction.reference,
    refundedAmount, originalAmount: transaction.amount, processed: refund.status === "processed" };
}

export async function providerPortal(input: SubscriptionInput): Promise<string> {
  requireMembershipTest();
  if (input.provider === "polar") {
    const session = await polar().customerSessions.create({ customer_id: identifier.parse(input.customerId), return_url: returnUrl(input.returnUrl) });
    return hostedUrl(session.customer_portal_url, "polar", true);
  }
  const subscription = await paystackSubscription(input.subscriptionId, false);
  if (subscription.customer.customer_code !== input.customerId) throw unavailable();
  const result = z.object({ link: z.url() }).parse(await paystack(`/subscription/${encodeURIComponent(input.subscriptionId)}/manage/link`));
  return hostedUrl(result.link, "paystack", true);
}
export async function cancelProviderSubscription(input: SubscriptionInput): Promise<void> {
  requireMembershipTest();
  if (input.provider === "polar") {
    const subscription = await polar().subscriptions.get(identifier.parse(input.subscriptionId));
    if (subscription.customer_id !== input.customerId) throw unavailable();
    await polar().subscriptions.update(input.subscriptionId, { cancel_at_period_end: true });
    return;
  }
  const subscription = await paystackSubscription(input.subscriptionId, false);
  if (subscription.customer.customer_code !== input.customerId || !subscription.email_token) throw unavailable();
  if (["non-renewing", "cancelled", "completed", "complete"].includes(subscription.status)) return;
  await paystack("/subscription/disable", { code: input.subscriptionId, token: subscription.email_token });
}

export async function verifyPolarWebhook(rawBody: Uint8Array, headers: Headers) {
  requireMembershipTest();
  try {
    return await webhooks.validateEvent(Buffer.from(rawBody), {
      "webhook-id": headers.get("webhook-id") ?? "", "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
    }, required("POLAR_WEBHOOK_SECRET"));
  } catch (error) {
    // The SDK checks the signature before reporting a newly introduced event type.
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) return { type: "unhandled", data: {} };
    throw error;
  }
}
