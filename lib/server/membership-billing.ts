import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { membershipRecordSchema, membershipPeriod, type MembershipProvider, type MembershipRecord } from "@/lib/membership/schema";
import { membershipCheckoutAvailability, requireMembershipTest } from "./membership-config";
import { getMembershipUsageSnapshot } from "./membership-usage";
import { initializeProviderCheckout, validateProviderConfig, providerPortal, cancelProviderSubscription, verifyProviderCheckout, type VerifiedMembership } from "./billing-providers";
import countries from "@/lib/planner/data/currencies.json";

const checkoutSchema = z.object({
  id: z.uuid(), uid: z.string(), provider: z.enum(["paystack", "polar"]), country: z.string(),
  state: z.enum(["creating", "open", "paid"]), providerId: z.string().optional(), url: z.url().optional(),
  createdAt: z.number(),
});
const checkoutInput = z.object({ country: z.string().length(2).refine((value) => value in countries.regions) });
const ownerPath = (uid: string) => getDatabase().collection("users").doc(uid);
export const billingSubscriptionKey = (provider: MembershipProvider, id: string) => createHash("sha256").update(`${provider}:${id}`).digest("hex");

async function account(request: Request) {
  requireMembershipTest();
  const auth = await authenticatedClient(request);
  if (!auth) throw new RequestError("Sign in to open your membership.", 401);
  if ((await auth.db.collection("users").doc(auth.user.uid).get()).data()?.transferredTo) throw new RequestError("This guest session moved to your account. Sign in again to continue.", 401);
  return auth;
}
async function payer(request: Request) {
  const auth = await account(request);
  if (auth.user.firebase.sign_in_provider === "anonymous" || !auth.user.email) throw new RequestError("Sign in with your email before starting a subscription.", 401);
  return auth;
}
function returnUrl(id?: string) {
  const origin = new URL(process.env.DATE_ATLAS_BILLING_ORIGIN || (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3005"));
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.hostname === "adateatlas.com" || origin.hostname.endsWith(".adateatlas.com") || origin.hostname === "date-atlas.vercel.app"
    || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new RequestError("The test checkout return address isn't configured.", 503);
  return new URL(id ? `/membership?checkout=${id}` : "/membership", origin).href;
}

export async function membershipSummary(request: Request) {
  try {
    const auth = await account(request);
    const usage = await getMembershipUsageSnapshot(auth.db, auth.user.uid);
    return Response.json({ ...usage, enabled: true, mode: "test", signedIn: auth.user.firebase.sign_in_provider !== "anonymous", checkout: membershipCheckoutAvailability() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function membershipCheckout(request: Request) {
  try {
    const auth = await payer(request);
    const input = checkoutInput.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Choose your billing country.", 400);
    const provider = input.data.country === "NG" ? "paystack" : "polar";
    if (!membershipCheckoutAvailability()[provider]) throw new RequestError("Test checkout isn't connected for this region yet.", 503);
    await validateProviderConfig(provider);
    const callback = returnUrl();
    const user = ownerPath(auth.user.uid);
    const checkout = user.collection("billingCheckout").doc("current");
    const id = randomUUID();
    const claim = await auth.db.runTransaction(async (tx) => {
      const [member, current] = await tx.getAll(user.collection("membership").doc("current"), checkout);
      if (member.exists) throw new RequestError("Your account already has a subscription. Manage billing to change it.", 409);
      if (current.exists) {
        const pending = checkoutSchema.parse(current.data());
        if (pending.provider !== provider) throw new RequestError("A checkout is already open with another provider. Finish or review that checkout first.", 409);
        if (pending.state === "open" && pending.url) return { url: pending.url };
        throw new RequestError("Your checkout is being prepared or checked. Refresh your membership before trying again.", 409);
      }
      tx.create(checkout, { id, uid: auth.user.uid, provider, country: input.data.country, state: "creating", createdAt: Date.now() });
      return { url: null };
    });
    if (claim.url) return Response.json({ url: claim.url }, { headers: { "Cache-Control": "no-store" } });
    // Keep the pending reference on an ambiguous timeout, so retries cannot create a second subscription.
    const hosted = await initializeProviderCheckout({ provider, uid: auth.user.uid, email: auth.user.email!, checkoutId: id, returnUrl: `${callback}?checkout=${id}` });
    await checkout.update({ providerId: hosted.id, url: hosted.url, state: "open" });
    return Response.json({ url: hosted.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function applyVerifiedMembership(uid: string, value: VerifiedMembership, eventId: string, checkedAt = Date.now()) {
  requireMembershipTest();
  if (value.uid && value.uid !== uid) throw new RequestError("The billing account couldn't be matched.", 409);
  const db = getDatabase();
  const user = ownerPath(uid);
  const ref = user.collection("membership").doc("current");
  const event = user.collection("billingEvents").doc(createHash("sha256").update(eventId).digest("hex"));
  const mapping = db.collection("billingSubscriptions").doc(billingSubscriptionKey(value.provider, value.subscriptionId));
  const payment = value.paid && value.paymentId ? db.collection("billingPayments").doc(billingSubscriptionKey(value.provider, value.paymentId)) : null;
  await db.runTransaction(async (tx) => {
    const [seen, existing, owner] = await tx.getAll(event, ref, mapping);
    const paymentOwner = payment ? (await tx.get(payment)).data() : null;
    if (seen.exists) return;
    if (owner.exists && owner.data()?.uid !== uid) throw new RequestError("The billing account couldn't be matched.", 409);
    const parsed = membershipRecordSchema.safeParse(existing.data());
    const current = parsed.success ? parsed.data : null;
    if (paymentOwner && (paymentOwner.uid !== uid || paymentOwner.subscriptionId !== value.subscriptionId)) throw new RequestError("The payment was already linked to a different account.", 409);
    if (current && (current.provider !== value.provider || current.subscriptionId !== value.subscriptionId)) throw new RequestError("A different subscription is already linked. Review billing before continuing.", 409);
    if (!value.paid && !current) throw new RequestError("The payment is still being confirmed. Please refresh shortly.", 409);
    if (current?.providerCheckedAt && current.providerCheckedAt > checkedAt) return;
    const now = Date.now();
    const newerPaidPeriod = value.paid && (!current || value.periodEnd >= current.paidPeriodEnd);
    const next: MembershipRecord = membershipRecordSchema.parse({
      provider: value.provider, subscriptionId: value.subscriptionId, customerId: value.customerId,
      status: value.revoked || current?.status === "revoked" && (!value.paid || value.periodStart < current.paidPeriodEnd) ? "revoked" : value.cancelAtPeriodEnd ? "canceled" : value.status === "past_due" ? "past_due" : "active",
      paidPeriodStart: newerPaidPeriod ? value.periodStart : current?.paidPeriodStart,
      paidPeriodEnd: newerPaidPeriod ? value.periodEnd : current?.paidPeriodEnd,
      cancelAtPeriodEnd: value.cancelAtPeriodEnd, updatedAt: now, providerCheckedAt: checkedAt,
    });
    tx.set(ref, next);
    tx.set(mapping, { uid, provider: value.provider, subscriptionId: value.subscriptionId });
    if (payment) tx.set(payment, { uid, provider: value.provider, subscriptionId: value.subscriptionId, customerId: value.customerId, periodStart: value.periodStart, periodEnd: value.periodEnd });
    tx.create(event, { processedAt: now });
  });
}

export async function membershipConfirm(request: Request) {
  try {
    const auth = await payer(request);
    const parsed = z.object({ checkoutId: z.uuid() }).safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Reopen your membership to check payment.", 400);
    const ref = ownerPath(auth.user.uid).collection("billingCheckout").doc("current");
    const checkout = checkoutSchema.safeParse((await ref.get()).data());
    if (!checkout.success || checkout.data.id !== parsed.data.checkoutId || !checkout.data.providerId) throw new RequestError("This checkout isn't available in your account.", 404);
    const checkedAt = Date.now();
    const verified = await verifyProviderCheckout(checkout.data.provider, checkout.data.providerId);
    if (verified.checkoutId !== checkout.data.id) throw new RequestError("The payment couldn't be matched to this checkout.", 409);
    await applyVerifiedMembership(auth.user.uid, verified, `checkout:${checkout.data.id}`, checkedAt);
    await ref.update({ state: "paid" });
    return Response.json({ confirmed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function membershipManage(request: Request, action: "portal" | "cancel") {
  try {
    const auth = await payer(request);
    const ref = ownerPath(auth.user.uid).collection("membership").doc("current");
    const parsed = membershipRecordSchema.safeParse((await ref.get()).data());
    if (!parsed.success) throw new RequestError("No subscription is linked to this account.", 404);
    const member = parsed.data;
    const options = { provider: member.provider, customerId: member.customerId, subscriptionId: member.subscriptionId, returnUrl: returnUrl() };
    if (action === "portal") return Response.json({ url: await providerPortal(options) }, { headers: { "Cache-Control": "no-store" } });
    await cancelProviderSubscription(options);
    await auth.db.runTransaction(async (tx) => {
      const current = membershipRecordSchema.parse((await tx.get(ref)).data());
      if (current.subscriptionId !== member.subscriptionId || current.provider !== member.provider) throw new RequestError("Your subscription changed. Refresh your membership.", 409);
      tx.update(ref, { status: "canceled", cancelAtPeriodEnd: true, updatedAt: Date.now(), providerCheckedAt: Date.now() });
    });
    return Response.json({ canceled: true, accessUntil: membershipPeriod(member).periodEnd }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
