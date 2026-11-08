import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/firebase/server";
import { apiError, RequestError } from "@/lib/planner/http";
import { requireMembershipTest } from "./membership-config";
import { applyVerifiedMembership, billingSubscriptionKey } from "./membership-billing";
import { fetchProviderSubscription, verifyProviderCheckout, verifyPaystackTransaction, verifyPaystackInvoice, verifyPaystackRefund, verifyPolarWebhook } from "./billing-providers";
import { verifyPaystackWebhook } from "./billing-signatures";
import type { MembershipProvider } from "@/lib/membership/schema";
import { membershipRecordSchema } from "@/lib/membership/schema";

async function rawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Missing webhook body.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 256000) { await reader.cancel(); throw new RequestError("Webhook body too large.", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function linkedOwner(provider: MembershipProvider, subscriptionId: string) {
  const row = await getDatabase().collection("billingSubscriptions").doc(billingSubscriptionKey(provider, subscriptionId)).get();
  const uid = row.data()?.uid;
  return typeof uid === "string" ? uid : null;
}
async function initialCheckout(uid: string, provider: MembershipProvider, checkoutId: string) {
  const ref = getDatabase().collection("users").doc(uid).collection("billingCheckout").doc("current");
  const row = (await ref.get()).data();
  if (!row || row.id !== checkoutId || row.uid !== uid || row.provider !== provider) throw new RequestError("No matching checkout.", 409);
  const providerId = typeof row.providerId === "string" ? row.providerId : provider === "paystack" ? checkoutId : null;
  if (!providerId) throw new RequestError("Checkout is still being prepared.", 409);
  const checkedAt = Date.now();
  const verified = await verifyProviderCheckout(provider, providerId);
  if (verified.uid !== uid || verified.checkoutId !== checkoutId) throw new RequestError("The payment couldn't be matched.", 409);
  await applyVerifiedMembership(uid, verified, `checkout:${checkoutId}`, checkedAt);
  await ref.update({ state: "paid" });
}

export async function membershipWebhook(request: Request, provider: MembershipProvider) {
  try {
    requireMembershipTest();
    const body = await rawBody(request);
    if (provider === "polar") {
      let event: Awaited<ReturnType<typeof verifyPolarWebhook>>;
      try { event = await verifyPolarWebhook(body, request.headers); }
      catch { throw new RequestError("Invalid webhook signature or payload.", 401); }
      const subscription = z.object({ id: z.string(), customer: z.object({ external_id: z.string().nullable() }).optional(), metadata: z.record(z.string(), z.unknown()).optional() });
      const order = z.object({ subscription_id: z.string().nullable() });
      let id: string | null = null;
      if (event.type.startsWith("subscription.")) { const parsed = subscription.safeParse(event.data); if (parsed.success) id = parsed.data.id; }
      else if (["order.paid", "order.refunded"].includes(event.type)) { const parsed = order.safeParse(event.data); if (parsed.success) id = parsed.data.subscription_id; }
      if (!id) return Response.json({ received: true });
      const checkedAt = Date.now();
      const verified = await fetchProviderSubscription("polar", id);
      const uid = await linkedOwner("polar", id);
      if (uid) await applyVerifiedMembership(uid, verified, `polar:${request.headers.get("webhook-id")}`, checkedAt);
      else if (verified.uid && verified.checkoutId) await initialCheckout(verified.uid, "polar", verified.checkoutId);
      else throw new RequestError("The subscription is still being matched.", 409);
    } else {
      if (!verifyPaystackWebhook(body, request.headers, process.env.PAYSTACK_SECRET_KEY ?? "", process.env.PAYSTACK_WEBHOOK_SECRET)) throw new RequestError("Invalid webhook signature.", 401);
      const parsed = z.object({ event: z.string(), data: z.record(z.string(), z.unknown()) }).safeParse(JSON.parse(body.toString("utf8")));
      if (!parsed.success) throw new RequestError("Invalid webhook payload.", 400);
      const { event, data } = parsed.data;
      if (event === "charge.success") {
        const reference = z.string().parse(data.reference);
        const paid = await verifyPaystackTransaction(reference);
        await initialCheckout(paid.uid, "paystack", paid.checkoutId);
      } else if (event === "invoice.update" && (data.paid === true || data.paid === 1)) {
        const checkedAt = Date.now();
        const verified = await verifyPaystackInvoice(data);
        const uid = await linkedOwner("paystack", verified.subscriptionId);
        if (!uid) throw new RequestError("The subscription is still being matched.", 409);
        const invoiceId = z.union([z.string(), z.number()]).parse(data.invoice_code ?? data.id);
        await applyVerifiedMembership(uid, verified, `paystack:invoice:${invoiceId}`, checkedAt);
      } else if (event === "refund.processed") {
        const refund = await verifyPaystackRefund(data);
        if (refund.processed && refund.refundedAmount >= refund.originalAmount) {
          const payment = (await getDatabase().collection("billingPayments").doc(billingSubscriptionKey("paystack", refund.paymentId)).get()).data();
          if (payment && typeof payment.uid === "string" && payment.customerId === refund.customerId) {
            const ref = getDatabase().collection("users").doc(payment.uid).collection("membership").doc("current");
            await getDatabase().runTransaction(async (tx) => {
              const current = membershipRecordSchema.safeParse((await tx.get(ref)).data());
              if (current.success && current.data.provider === "paystack" && current.data.subscriptionId === payment.subscriptionId && current.data.paidPeriodStart === payment.periodStart && current.data.paidPeriodEnd === payment.periodEnd) tx.update(ref, { status: "revoked", updatedAt: Date.now(), providerCheckedAt: Date.now() });
            });
          }
        }
      } else if (["subscription.not_renew", "subscription.disable", "invoice.payment_failed"].includes(event)) {
        const parsed = z.object({ subscription_code: z.string() }).safeParse(data.subscription ?? data);
        if (parsed.success) {
          const uid = await linkedOwner("paystack", parsed.data.subscription_code);
          if (uid) {
            const checkedAt = Date.now();
            const verified = await fetchProviderSubscription("paystack", parsed.data.subscription_code);
            // A signed event triggers a fresh provider lookup; timestamps in the event never extend access.
            await applyVerifiedMembership(uid, verified, `paystack:${createHash("sha256").update(body).digest("hex")}`, checkedAt);
          }
        }
      }
    }
    return Response.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
