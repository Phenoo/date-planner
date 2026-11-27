"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNativeApp } from "./use-native-app";
import { NativeAppHeader, NativeAppNavigation, nativePlanningPath } from "./native-app-ui";
import { AtlasIcon } from "./atlas-icon";
import nativeStyles from "./native-app.module.css";
import { onIdTokenChanged } from "firebase/auth";
import { ArrowLeft, ArrowRight, Bookmark, CalendarDays, Check, CreditCard, Heart, RefreshCw, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { membershipSummarySchema, type MembershipSummary } from "@/lib/membership/schema";
import { getBrowserAuth, hasPendingAccountTransfer, waitForAccountTransition } from "@/lib/firebase/client";
import { plannerFetch, planningToken } from "@/lib/firebase/planner-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AccountAccess } from "./account-access";
import { RecurringDateNight } from "./recurring-date-night";
import styles from "./membership.module.css";

const linkSchema = z.object({ url: z.url() });
type MembershipAction = "checkout" | "portal" | "cancel" | "confirm";

async function responseBody(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Membership services couldn't connect. Please try again.");
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "We couldn't update your membership. Please try again.");
  return body;
}

function displayDate(value: number) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
}

export function Membership({ countries }: { countries: { code: string; name: string }[] }) {
  const nativeApp = useNativeApp();
  const router = useRouter();
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [signedInOwner, setSignedInOwner] = useState<string | null>(null);
  const signedIn = signedInOwner !== null;
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<MembershipAction | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const mounted = useRef(false);
  const owner = useRef<string | null>(null);
  const identity = useRef("");
  const summaryRequest = useRef<AbortController | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  const confirmed = useRef("");
  const active = useCallback((uid: string | null, signal: AbortSignal) => mounted.current && !signal.aborted && owner.current === uid && (getBrowserAuth()?.currentUser?.uid ?? null) === uid, []);

  const refresh = useCallback(async () => {
    summaryRequest.current?.abort();
    const controller = new AbortController();
    summaryRequest.current = controller;
    const uid = getBrowserAuth()?.currentUser?.uid ?? null;
    if (mounted.current) { setLoading(true); setError(""); }
    try {
      await waitForAccountTransition();
      if (!active(uid, controller.signal)) return;
      if (hasPendingAccountTransfer()) throw new Error("Finish signing in to keep your dates and membership together.");
      const response = await plannerFetch("/api/membership", { cache: "no-store", signal: controller.signal });
      const next = membershipSummarySchema.safeParse(await responseBody(response));
      if (!next.success) throw new Error("Your membership couldn't be loaded. Please refresh and try again.");
      if (active(uid, controller.signal)) setSummary(next.data);
    } catch (failure) {
      if (active(uid, controller.signal)) setError(failure instanceof Error ? failure.message : "Your membership couldn't be loaded. Please try again.");
    } finally {
      if (active(uid, controller.signal)) setLoading(false);
    }
  }, [active]);

  const act = useCallback(async (action: MembershipAction, payload: Record<string, string> = {}) => {
    if (actionRequest.current) return;
    const user = getBrowserAuth()?.currentUser;
    if (!user || user.isAnonymous) { setAuthOpen(true); return; }
    const uid = user.uid;
    const controller = new AbortController();
    actionRequest.current = controller;
    setBusy(action); setError(""); setMessage("");
    try {
      await waitForAccountTransition();
      if (!active(uid, controller.signal)) return;
      const response = await plannerFetch(`/api/membership/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const data = await responseBody(response);
      if (!active(uid, controller.signal)) return;
      if (action === "checkout" || action === "portal") {
        const parsed = linkSchema.safeParse(data);
        if (!parsed.success) throw new Error("The billing link couldn't be verified. Please try again.");
        const url = new URL(parsed.data.url);
        if (url.protocol !== "https:" || !(url.hostname === "sandbox.polar.sh" || url.hostname === "paystack.com" || url.hostname.endsWith(".paystack.com"))) throw new Error("The billing link couldn't be verified. Please try again.");
        window.location.assign(url.href);
      } else {
        setCancelOpen(false);
        setMessage(action === "cancel" ? "Renewal has been canceled. Your paid access continues through the end of your current period." : "Payment checked. Your membership status below reflects confirmed billing updates.");
        await refresh();
      }
    } catch (failure) {
      if (active(uid, controller.signal)) setError(failure instanceof Error ? failure.message : "Your membership couldn't be updated. Please try again.");
    } finally {
      if (actionRequest.current === controller) actionRequest.current = null;
      if (active(uid, controller.signal)) setBusy(null);
    }
  }, [active, refresh]);

  useEffect(() => {
    mounted.current = true;
    identity.current = "";
    const auth = getBrowserAuth();
    const setup = new AbortController();
    const unsubscribe = auth ? onIdTokenChanged(auth, (user) => {
      const nextIdentity = `${user?.uid ?? ""}:${user?.isAnonymous ?? true}`;
      if (identity.current === nextIdentity) return;
      identity.current = nextIdentity;
      owner.current = user?.uid ?? null;
      summaryRequest.current?.abort(); actionRequest.current?.abort(); actionRequest.current = null;
      setSummary(null); setError(""); setMessage(""); setBusy(null); setCancelOpen(false);
      setSignedInOwner(user && !user.isAnonymous ? user.uid : null);
      if (user) void refresh();
      else setLoading(true);
    }) : null;
    void planningToken(setup.signal).then(() => {
      if (!mounted.current || setup.signal.aborted) return;
      if (!getBrowserAuth()) { setLoading(false); setError("Account services aren't available. Please try again later."); }
    }).catch(() => { if (mounted.current && !setup.signal.aborted) { setLoading(false); setError("Your account couldn't connect. Please refresh and try again."); } });
    return () => { mounted.current = false; setup.abort(); summaryRequest.current?.abort(); actionRequest.current?.abort(); unsubscribe?.(); };
  }, [refresh]);

  useEffect(() => {
    if (!signedIn || !summary || loading || busy) return;
    const checkout = z.uuid().safeParse(new URLSearchParams(window.location.search).get("checkout"));
    const uid = getBrowserAuth()?.currentUser?.uid;
    if (!uid || !checkout.success || confirmed.current === `${uid}:${checkout.data}`) return;
    confirmed.current = `${uid}:${checkout.data}`;
    void act("confirm", { checkoutId: checkout.data });
  }, [signedIn, summary, loading, busy, act]);

  const provider = country === "NG" ? "paystack" : "polar";
  const price = country === "NG" ? "₦5,000" : "US$5";
  const existingMembership = !!summary?.provider;
  const checkoutReady = !!country && !!summary?.checkout[provider] && !existingMembership;
  const disabled = loading || busy !== null;
  const membershipName = summary?.tier === "plus" ? "A Date At las Plus" : "Free";

  return <div className={`${styles.shell} ${nativeApp ? `${nativeStyles.surface} ${nativeStyles.root} ${styles.nativeShell} atlas-app` : ""}`}>
    {nativeApp && <NativeAppHeader title="A Date At las Plus" onHome={() => router.push("/")} />}
    {!nativeApp && <header className={styles.header}>
      <Link href="/" className="atlas-wordmark" aria-label="A Date At las home">adal<span>.</span></Link>
      <Link href="/profile" className={styles.back}><ArrowLeft size={16} aria-hidden="true" />Your profile</Link>
    </header>}
    <main className={styles.main}>
      <div className={styles.intro}>
        <span className={styles.test}><ShieldCheck size={14} aria-hidden="true" />Test mode · no real payments</span>
        <p className={styles.eyebrow}>A LITTLE MORE TIME TOGETHER</p>
        {nativeApp && <span className={nativeStyles.membershipTicket}><AtlasIcon name="us-rings" size={34} /><strong>PLUS</strong></span>}
        <h1>{nativeApp ? <>Keep choosing<br />each other.</> : "Make room for your next date."}</h1>
        <p className={styles.lead}>Thoughtful plans, whenever you’re ready to make a little time for each other.</p>
      </div>

      <section className={styles.current} aria-labelledby="current-membership-heading" aria-busy={loading}>
        <div><span className={styles.label}>Your membership</span><h2 id="current-membership-heading">{loading && !summary ? "Checking your membership…" : summary ? membershipName : "Let’s get you connected."}</h2>
          {summary && <p>{summary.status === "canceling" ? `Plus access ends ${displayDate(summary.periodEnd)}.` : summary.status === "past_due" ? "Your latest payment needs attention. Review your billing details." : summary.status === "expired" ? "Your Plus access has ended. Your saved dates are still here." : summary.tier === "plus" ? `Your billing period ends ${displayDate(summary.periodEnd)}.` : `Your free allowance resets ${displayDate(summary.periodEnd)}.`}</p>}
        </div>
        <Button type="button" variant="ghost" size="small" onClick={() => void refresh()} disabled={disabled}><RefreshCw size={15} aria-hidden="true" />Refresh status</Button>
        {summary?.tier === "free" && <dl className={styles.usage}>
          <div><dt>New date plans</dt><dd><strong>{summary.plans.remaining}</strong> of {summary.plans.limit} available</dd></div>
        </dl>}
        {!signedIn && <Button type="button" variant="outline" size="small" onClick={() => setAuthOpen(true)}>Sign in</Button>}
        {summary?.provider && <div className={styles.manage}>
          <span><CreditCard size={15} aria-hidden="true" />Billing with {summary.provider === "paystack" ? "Paystack" : "Polar"}</span>
          <Button type="button" variant="outline" size="small" disabled={disabled} onClick={() => void act("portal")}>{busy === "portal" ? "Opening billing…" : "Manage billing"}<ArrowRight size={14} aria-hidden="true" /></Button>
          {summary.status === "active" && <button className={styles.textButton} type="button" disabled={disabled} onClick={() => setCancelOpen(true)}>Cancel renewal</button>}
        </div>}
      </section>

      {error && <div className={styles.notice} role="alert">{error}</div>}
      {message && <div className={styles.notice} role="status">{message}</div>}

      {signedInOwner && summary?.provider && <RecurringDateNight key={signedInOwner} ownerId={signedInOwner} entitled={summary.tier === "plus"} countries={countries} />}
      <div className={styles.plans}>
        <section className={styles.plan} aria-labelledby="free-heading">
          <span className={styles.planMark}><Heart size={22} strokeWidth={1.5} aria-hidden="true" /></span>
          <h2 id="free-heading">Free</h2><p>A lovely place to begin.</p>
          <div className={styles.price}>Free<span>Always</span></div>
          <ul><li><Check size={17} aria-hidden="true" />1 new date plan each month</li><li><Check size={17} aria-hidden="true" />Save your dates</li><li><Check size={17} aria-hidden="true" />Personal invitations and basic reminders</li></ul>
          <Link href="/plan" className={styles.freeLink}>Plan a date<ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
        <section className={`${styles.plan} ${styles.plus}`} aria-labelledby="plus-heading">
          <span className={styles.planMark}>{nativeApp ? <AtlasIcon name="membership" size={27} /> : <CalendarDays size={22} strokeWidth={1.5} aria-hidden="true" />}</span>
          <h2 id="plus-heading">A Date At las Plus</h2><p>Keep good dates on the calendar.</p>
          <div className={styles.price}>{country ? price : "₦5,000 / US$5"}<span>per month{!country ? " · based on billing country" : ""}</span></div>
          <ul>
            <li><Check size={17} aria-hidden="true" />Recurring date nights with a fresh idea before each one</li>
            <li><Check size={17} aria-hidden="true" />Ideas from your shared wishlist when a place fits</li>
            <li><Check size={17} aria-hidden="true" />Date plans and venue changes with no monthly cap</li>
            <li><Check size={17} aria-hidden="true" />Everything included in Free</li>
          </ul>
          {!existingMembership && <>
            <label className={styles.country}><span>Your billing country</span><select autoComplete="country" value={country} disabled={disabled} onChange={(event) => { setCountry(event.target.value); setError(""); }}><option value="">Choose your country</option>{countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select><small>Choose where you live. Your date can be anywhere.</small></label>
            {!!country && <p className={styles.billingNote}>{provider === "paystack" ? "Billed in naira through Paystack." : "Billed in US dollars through Polar. Any applicable taxes are shown at checkout."}</p>}
            <Button type="button" className={styles.checkout} disabled={disabled || signedIn && !checkoutReady || !country} onClick={() => { if (!signedIn) setAuthOpen(true); else void act("checkout", { country }); }}>{busy === "checkout" ? "Opening secure checkout…" : signedIn ? "Continue to test checkout" : "Sign in to try Plus"}<ArrowRight size={17} aria-hidden="true" /></Button>
            {!!country && summary && !summary.checkout[provider] && <p className={styles.unavailable}>Test checkout isn’t connected for this region yet. Your free plan is available.</p>}
          </>}
          {existingMembership && <p className={styles.billingNote}>Your membership is already linked to {summary.provider === "paystack" ? "Paystack" : "Polar"}. Manage billing above to review your subscription.</p>}
        </section>
      </div>

      <section className={styles.details} aria-labelledby="membership-details-heading">
        <h2 id="membership-details-heading">A few good things to know.</h2>
        <div><Bookmark size={21} aria-hidden="true" /><p><strong>Your dates stay yours.</strong> Saved dates and invitations remain available when your membership ends.</p></div>
        <div><RefreshCw size={21} aria-hidden="true" /><p><strong>Only successful recommendations count.</strong> Failed searches don’t use your allowance. Editing a time or invitation doesn’t use a new plan.</p></div>
        <div><Heart size={21} aria-hidden="true" /><p><strong>Planning is included.</strong> Meals, tickets, transport and venue purchases are paid separately. The free plan allowance resets each month.</p></div>
        <p className={styles.cancelNote}>Plus renews monthly until canceled. Cancel renewal at any time and keep access for the remainder of your paid period.</p>
      </section>
    </main>
    {!nativeApp && <footer className={styles.footer}><span>A Date At las</span><div><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><a href="mailto:support@adateatlas.com">Get in touch</a></div></footer>}
    {nativeApp && <NativeAppNavigation active="profile" onPlan={() => router.push(nativePlanningPath())} />}
    <Dialog open={authOpen} onOpenChange={setAuthOpen} title="Sign in for your membership" className={styles.authDialog}><AccountAccess onDone={() => { setAuthOpen(false); void refresh(); }} /></Dialog>
    <Dialog open={cancelOpen} onOpenChange={(open) => { if (busy !== "cancel") setCancelOpen(open); }} title="Cancel your Plus renewal?" className={styles.cancelDialog}>
      <h2>Cancel your Plus renewal?</h2><p>Your Plus benefits continue until {summary ? displayDate(summary.periodEnd) : "the end of your paid period"}. Your saved dates and invitations stay available.</p>
      <div className={styles.cancelActions}><Button type="button" variant="outline" disabled={disabled} onClick={() => setCancelOpen(false)}>Keep Plus</Button><Button type="button" disabled={disabled} onClick={() => void act("cancel")}>{busy === "cancel" ? "Canceling renewal…" : "Cancel renewal"}</Button></div>
    </Dialog>
  </div>;
}
