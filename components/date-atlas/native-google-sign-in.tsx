"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApps, initializeApp } from "firebase/app";
import { browserPopupRedirectResolver, connectAuthEmulator, getAuth, GoogleAuthProvider, initializeAuth, inMemoryPersistence, signInWithPopup } from "firebase/auth";
import { getBrowserAuth, authErrorMessage } from "@/lib/firebase/client";
import { nativeAuthCompleteSchema, nativeAuthReturnUrl, nativeAuthSecretSchema } from "@/lib/firebase/native-auth";
import { Button } from "@/components/ui/button";
import styles from "./account-email-action.module.css";

function getSignInAuth() {
  const current = getBrowserAuth();
  if (!current) return null;
  const existing = getApps().find(app => app.name === "date-atlas-native-google");
  const auth = existing ? getAuth(existing) : initializeAuth(initializeApp(current.app.options, "date-atlas-native-google"), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  const emulator = current.emulatorConfig;
  if (emulator && !auth.emulatorConfig) connectAuthEmulator(auth, `${emulator.protocol}://${emulator.host}:${emulator.port}`, { disableWarnings: true });
  return auth;
}

export function NativeGoogleSignIn() {
  const session = nativeAuthSecretSchema.safeParse(useSearchParams().get("session"));
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const complete = code !== null;
  const returnUrl = session.success && code ? `${nativeAuthReturnUrl}?session=${session.data}&code=${code}` : null;

  async function signIn() {
    if (!session.success || active.current) return;
    const auth = getSignInAuth();
    if (!auth) { setError("Google sign-in isn't available right now. Return to the app and try again later."); return; }
    active.current = true; setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, provider);
      if (abort.signal.aborted) return;
      const token = await user.getIdToken();
      const response = await fetch("/api/auth/native", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "complete", sessionId: session.data }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) });
      if (!response.ok) {
        const data: unknown = await response.json();
        throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Sign-in couldn't finish. Return to the app and try again.");
      }
      const { code } = nativeAuthCompleteSchema.parse(await response.json());
      if (!mounted.current || abort.signal.aborted) return;
      setCode(code);
      const destination = new URL(nativeAuthReturnUrl);
      destination.search = new URLSearchParams({ session: session.data, code }).toString();
      window.location.assign(destination.href);
    } catch (failure) {
      if (mounted.current && !abort.signal.aborted) setError(authErrorMessage(failure));
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <main className={styles.screen}>
    <header className={styles.header}><span className={styles.brand}>adal<span>.</span></span></header>
    <section className={styles.panel}>
      <span className={styles.eyebrow}>A Date At las</span>
      <h1>{complete ? "You're ready to return." : "Continue with Google."}</h1>
      <p className={styles.lead}>{complete ? "Return to the app to finish signing in and pick up your date." : "Choose your Google account. We’ll bring you back to the app when you’re done."}</p>
      {!session.success ? <p role="alert">This sign-in link is invalid. Return to the app and try again.</p> : complete && returnUrl ? <a className="button" href={returnUrl}>Return to the app</a> : <Button type="button" className={styles.submit} disabled={busy} onClick={() => void signIn()}>{busy ? "Connecting…" : "Continue with Google"}</Button>}
      {error && <p role="alert" className={styles.message}>{error}</p>}
    </section>
  </main>;
}
