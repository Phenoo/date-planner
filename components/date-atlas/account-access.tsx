"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, EmailAuthProvider, linkWithCredential, linkWithPopup, signInWithPopup, signInWithCredential, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { getBrowserAuth, authenticateAccount, hasPendingAccountTransfer, completeEmailSignIn, hasEmailSignInLink, sendEmailSignIn, authErrorMessage } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import styles from "./auth-screen.module.css";
export function AccountAccess({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [create, setCreate] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [reset, setReset] = useState(false); const [resetSent, setResetSent] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const authenticating = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function requestPasswordReset() {
    if (authenticating.current || resetSent) return;
    const auth = getBrowserAuth();
    if (!auth) { setError("Password recovery isn't available right now. Please try again later."); return; }
    authenticating.current = true; setBusy(true); setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      if (mounted.current) setResetSent(true);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof FirebaseError && failure.code === "auth/user-not-found") setResetSent(true);
      else if (failure instanceof FirebaseError && failure.code === "auth/invalid-email") setError("Please check your email address.");
      else if (failure instanceof FirebaseError && failure.code === "auth/too-many-requests") setError("Too many attempts. Please wait a little before trying again.");
      else if (failure instanceof FirebaseError && failure.code === "auth/network-request-failed") setError("Couldn't connect. Check your internet connection and try again.");
      else setError("We couldn't send a password reset link. Please try again.");
    } finally { authenticating.current = false; if (mounted.current) setBusy(false); }
  }
  async function authenticate(google = false, emailLink = false) {
    if (authenticating.current) return;
    const auth = getBrowserAuth(); if (!auth) { setError("Account services aren't available yet. You can still plan your date and try signing in later."); return; }
    authenticating.current = true;
    setBusy(true); setError("");
    try {
      if (await completeEmailSignIn(email)) { if (mounted.current) onDone(); return; }
      if (hasPendingAccountTransfer()) { await authenticateAccount(async () => {}, true); if (mounted.current) onDone(); return; }
      if (emailLink) { await sendEmailSignIn(email.trim()); if (mounted.current) setError("Your secure link is on its way. Check your email."); return; }
      await authenticateAccount(async (auth, guest) => {
        if (google) {
          const provider = new GoogleAuthProvider();
          try { if (guest) await linkWithPopup(guest, provider); else await signInWithPopup(auth, provider); }
          catch (failure) {
            const credential = failure instanceof FirebaseError ? GoogleAuthProvider.credentialFromError(failure) : null;
            if (credential && failure instanceof FirebaseError && failure.code === "auth/credential-already-in-use") await signInWithCredential(auth, credential);
            else throw failure;
          }
        } else if (create) {
          if (guest) await linkWithCredential(guest, EmailAuthProvider.credential(email.trim(), password));
          else await createUserWithEmailAndPassword(auth, email.trim(), password);
        } else await signInWithEmailAndPassword(auth, email.trim(), password);
      });
      if (mounted.current) onDone();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof FirebaseError ? authErrorMessage(failure) : failure instanceof Error ? failure.message : "Sign-in couldn't finish. Please retry.");
    } finally { authenticating.current = false; if (mounted.current) setBusy(false); }
  }
  if (hasPendingAccountTransfer()) return <div className={styles.account}>
    <span className={styles.eyebrow}>YOUR DATE IS STILL HERE</span>
    <h1>One last connection.</h1>
    <p className={styles.lead}>You’re signed in. Finish keeping your current date with your account, then we’ll return you to it.</p>
    <Button className={styles.submit} disabled={busy} onClick={() => void authenticate()}>{busy ? "Keeping your date together…" : "Finish sign-in"}</Button>
    {error && <p role="alert" className="auth-message">{error}</p>}
  </div>;
  return <div className={styles.account}>
    <span className={styles.eyebrow}>YOUR NEXT CHAPTER</span>
    <h1>{reset ? "Forgot your password?" : create ? "Create your account." : "Welcome back."}</h1>
    <p className={styles.lead}>{reset ? "Enter your account email and we'll send you a link to reset your password." : create ? "Give your favorite plans a home. Your next great date starts here." : "Sign in to keep your date plans together, wherever you go."}</p>
    {!reset && <>
      <Button type="button" variant="outline" className={styles.google} disabled={busy} onClick={() => void authenticate(true)}><Image src="/images/google-g.png" alt="" aria-hidden="true" width={20} height={20} unoptimized />Continue with Google</Button>
      <div className={styles.divider} aria-hidden="true">or continue with email</div>
    </>}
    <form className={`form-stack ${styles.form}`} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); if (reset) void requestPasswordReset(); else void authenticate(); }}>
      <label className="field"><span>Email</span><input ref={emailInput} type="email" required autoComplete="email" disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); setResetSent(false); setError(""); }} /></label>
      {!reset && <label className="field"><span>Password</span><input type="password" required minLength={create ? 6 : undefined} disabled={busy} autoComplete={create ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
      {!reset && !create && <button type="button" className={styles.forgot} disabled={busy} onClick={() => { setReset(true); setResetSent(false); setError(""); emailInput.current?.focus(); }}>Forgot password?</button>}
      <Button type="submit" className={styles.submit} disabled={busy || (reset && resetSent)}>{reset ? busy ? "Sending reset link…" : resetSent ? "Reset link requested" : "Send reset link" : busy ? "Connecting…" : create ? "Create my account" : "Sign in"}</Button>
      {reset ? <button type="button" className={styles.mode} disabled={busy} onClick={() => { setReset(false); setResetSent(false); setError(""); emailInput.current?.focus(); }}>Back to sign in</button> : <>
        <button type="button" className={styles.mode} disabled={busy} onClick={() => { setCreate((previous) => !previous); setError(""); }}>{create ? "Already have an account? Sign in" : "New here? Create an account"}</button>
        <button type="button" className={styles.emailLink} disabled={busy || !email} onClick={() => void authenticate(false, true)}>{hasEmailSignInLink() ? "Finish email-link sign-in" : "Use a secure email link instead"}</button>
      </>}
    </form>
    {reset && resetSent && <p role="status" className="auth-message">If an account uses this email, you&apos;ll receive a password reset link. Check your inbox and spam folder.</p>}
    <p className={styles.legal}><Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link></p>
    {error && <p role="status" className="auth-message">{error}</p>}
  </div>;
}
