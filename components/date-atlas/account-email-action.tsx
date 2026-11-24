"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ActionCodeOperation, applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode, type Auth } from "firebase/auth";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getBrowserAuth } from "@/lib/firebase/client";
import { siteOrigin, supportEmail } from "@/lib/seo/site";
import styles from "./account-email-action.module.css";

const actions = {
  resetPassword: { operation: ActionCodeOperation.PASSWORD_RESET, title: "Choose a new password.", description: "Set a new password for your A Date At las account.", button: "Save new password", success: "Your password is updated. You can sign in with it now." },
  verifyEmail: { operation: ActionCodeOperation.VERIFY_EMAIL, title: "Confirm your email.", description: "Confirm this email address for your A Date At las account.", button: "Confirm my email", success: "Your email address is confirmed." },
  recoverEmail: { operation: ActionCodeOperation.RECOVER_EMAIL, title: "Restore your email.", description: "Undo the email address change on your A Date At las account.", button: "Restore my email", success: "Your previous email address is restored. If you didn’t make this change, reset your password after signing in." },
  verifyAndChangeEmail: { operation: ActionCodeOperation.VERIFY_AND_CHANGE_EMAIL, title: "Confirm your new email.", description: "Use this email address for your A Date At las account.", button: "Confirm new email", success: "Your account email address is updated." },
  revertSecondFactorAddition: { operation: ActionCodeOperation.REVERT_SECOND_FACTOR_ADDITION, title: "Review your account security.", description: "Remove the recently added second sign-in factor from your A Date At las account.", button: "Remove added sign-in factor", success: "The added sign-in factor is removed. If you didn’t add it, reset your password after signing in." },
} as const;

type ActionMode = keyof typeof actions;
type ActionState = { status: "checking" } | { status: "ready"; email: string | null } | { status: "complete" } | { status: "error"; message: string; retryable: boolean };

function actionMode(value: string | null): ActionMode | null {
  return value && Object.hasOwn(actions, value) ? value as ActionMode : null;
}

export function accountActionContinuePath(value: string | null) {
  if (!value) return "/login";
  try {
    const destination = new URL(value);
    if (![siteOrigin, "https://date-atlas.vercel.app"].includes(destination.origin) || destination.username || destination.password || !["/", "/plan", "/saved", "/favorites", "/profile", "/login"].includes(destination.pathname)) return "/login";
    const query = new URLSearchParams();
    const flow = z.uuid().safeParse(destination.searchParams.get("flow"));
    if (destination.pathname === "/plan" && flow.success) query.set("flow", flow.data);
    return destination.pathname + (query.size ? `?${query}` : "");
  } catch { return "/login"; }
}

export function accountActionFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "auth/expired-action-code" || code === "auth/invalid-action-code" || code === "auth/user-disabled" || code === "auth/user-not-found") return { message: "This secure link has expired or was already used. Request a new email from the sign-in page.", retryable: false };
  if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") return { message: "Choose a stronger password that meets your account’s password requirements.", retryable: true };
  if (code === "auth/network-request-failed") return { message: "We couldn’t connect. Check your internet connection and try again.", retryable: true };
  return { message: "We couldn’t complete this account update. Please try again.", retryable: true };
}

export async function checkAccountEmailAction(auth: Auth, mode: ActionMode, code: string) {
  if (mode === "resetPassword") return verifyPasswordResetCode(auth, code);
  const info = await checkActionCode(auth, code);
  if (info.operation !== actions[mode].operation) throw new Error("account-action-mismatch");
  return info.data.email ?? null;
}

export function AccountEmailAction() {
  const query = useSearchParams();
  const mode = actionMode(query.get("mode"));
  const code = query.get("oobCode");
  const destination = accountActionContinuePath(query.get("continueUrl"));
  return <main className={styles.screen}>
    <header className={styles.header}><Link className={styles.brand} href="/" aria-label="A Date At las home">adal<span>.</span></Link></header>
    <section className={styles.panel} aria-labelledby="account-action-title">
      {mode && code && code.length <= 2048 ? <AccountActionForm key={`${mode}:${code}:${destination}`} mode={mode} code={code} destination={destination} /> : <>
        <h1 id="account-action-title">This link is incomplete.</h1>
        <p className={styles.lead}>Open the full link from your account email, or request a new one.</p>
        <Button asChild className={styles.submit}><Link href="/login">Go to sign in</Link></Button>
      </>}
      <p className={styles.footer}>Need a hand? <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
    </section>
  </main>;
}

function AccountActionForm({ mode, code, destination }: { mode: ActionMode; code: string; destination: string }) {
  const action = actions[mode];
  const [state, setState] = useState<ActionState>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    active.current = true;
    let current = true;
    const auth = getBrowserAuth();
    void (async () => {
      if (!auth) throw new Error("Account services are unavailable.");
      const email = await checkAccountEmailAction(auth, mode, code);
      if (!current) return;
      setState({ status: "ready", email });
    })().catch((failure: unknown) => {
      if (!current) return;
      setState(failure instanceof Error && failure.message === "account-action-mismatch"
        ? { status: "error", message: "This link doesn’t match the requested account update. Open the original email or request a new link.", retryable: false }
        : { status: "error", ...accountActionFailure(failure) });
    });
    return () => { current = false; active.current = false; };
  }, [mode, code, action.operation, attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || state.status !== "ready") return;
    if (mode === "resetPassword" && password !== confirmation) { setError("Your passwords don’t match. Please enter them again."); return; }
    const auth = getBrowserAuth();
    if (!auth) { setError("Account services are unavailable. Please try again later."); return; }
    pending.current = true;
    setBusy(true); setError("");
    try {
      if (mode === "resetPassword") await confirmPasswordReset(auth, code, password);
      else await applyActionCode(auth, code);
      if (!active.current) return;
      setPassword(""); setConfirmation("");
      setState({ status: "complete" });
    } catch (failure) {
      if (!active.current) return;
      const failureDetails = accountActionFailure(failure);
      if (failureDetails.retryable) setError(failureDetails.message);
      else setState({ status: "error", ...failureDetails });
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }

  return <>
    <span className={styles.eyebrow}>ACCOUNT SECURITY</span>
    <h1 id="account-action-title">{state.status === "complete" ? "You’re all set." : action.title}</h1>
    {state.status === "checking" && <p className={styles.lead} role="status" aria-busy="true">Checking your secure link…</p>}
    {state.status === "error" && <>
      <p className={styles.message} role="alert">{state.message}</p>
      {state.retryable ? <Button className={styles.submit} onClick={() => { setState({ status: "checking" }); setAttempt((value) => value + 1); }}>Try again</Button> : <Button asChild className={styles.submit}><Link href="/login">Request a new link</Link></Button>}
    </>}
    {state.status === "ready" && <>
      <p className={styles.lead}>{action.description}{state.email ? <> <strong>{state.email}</strong></> : null}</p>
      <form className={styles.form} onSubmit={(event) => void submit(event)} aria-busy={busy}>
        {mode === "resetPassword" && <>
          <label className="field"><span>New password</span><input type="password" required minLength={6} autoComplete="new-password" disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} /></label>
          <label className="field"><span>Confirm new password</span><input type="password" required minLength={6} autoComplete="new-password" disabled={busy} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }} /></label>
        </>}
        <Button type="submit" className={styles.submit} disabled={busy}>{busy ? "Updating your account…" : action.button}</Button>
      </form>
      {error && <p className={styles.message} role="alert">{error}</p>}
    </>}
    {state.status === "complete" && <>
      <p className={styles.lead} role="status">{action.success}</p>
      <Button asChild className={styles.submit}><Link href={mode === "resetPassword" || mode === "recoverEmail" ? "/login" : destination}>Continue</Link></Button>
    </>}
  </>;
}
