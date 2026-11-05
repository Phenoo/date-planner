"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onIdTokenChanged } from "firebase/auth";
import { getBrowserAuth, hasEmailSignInLink, hasPendingAccountTransfer, subscribeAccountTransfer, waitForAccountTransition } from "@/lib/firebase/client";
import { AccountAccess } from "./account-access";
import { AuthScreen } from "./auth-screen";

type SavedDatesAccessState = "checking" | "signed-in" | "sign-in" | "email-link";

export function observeSavedDatesAccess(onChange: (state: SavedDatesAccessState) => void) {
  const auth = getBrowserAuth();
  let active = true;
  let revision = 0;
  let authenticatedUid: string | null = null;
  if (!auth) {
    void Promise.resolve().then(() => { if (active) onChange("sign-in"); });
    return () => { active = false; };
  }
  const accountAuth = auth;
  function refresh() {
    if (!active) return;
    const current = ++revision;
    const currentUser = accountAuth.currentUser;
    if (authenticatedUid && (!currentUser || currentUser.uid !== authenticatedUid || currentUser.isAnonymous || hasPendingAccountTransfer())) onChange("checking");
    void (async () => {
      await accountAuth.authStateReady();
      try { await waitForAccountTransition(); } catch { /* Failed guest transfers stay available for AccountAccess to retry. */ }
      if (!active || current !== revision) return;
      const user = accountAuth.currentUser;
      const signedIn = !!user && !user.isAnonymous && !hasPendingAccountTransfer();
      authenticatedUid = signedIn ? user.uid : null;
      onChange(hasEmailSignInLink() ? "email-link" : signedIn ? "signed-in" : "sign-in");
    })().catch(() => { if (active && current === revision) onChange("sign-in"); });
  }
  const unsubscribeAuth = onIdTokenChanged(auth, refresh, () => { revision++; if (active) onChange("sign-in"); });
  const unsubscribeTransfer = subscribeAccountTransfer(refresh);
  refresh();
  return () => { active = false; revision++; unsubscribeAuth(); unsubscribeTransfer(); };
}

function useSavedDatesAccess() {
  const [state, setState] = useState<SavedDatesAccessState>("checking");
  const query = useSearchParams().toString();
  useLayoutEffect(() => observeSavedDatesAccess(setState), [query]);
  useLayoutEffect(() => () => {
    // Activity preserves hidden pages; require a fresh auth check when this one returns.
    setState("checking");
  }, []);
  return state;
}

function SavedDatesLoading() {
  return <main className="loading-state" role="status" aria-busy="true">Opening My dates…</main>;
}

export function SavedDatesGate({ children }: { children: ReactNode }) {
  const state = useSavedDatesAccess();
  const router = useRouter();
  useEffect(() => { if (state === "sign-in") router.replace("/login"); }, [state, router]);
  return state === "signed-in" || state === "email-link" ? children : <SavedDatesLoading />;
}

export function SavedDatesLogin() {
  const state = useSavedDatesAccess();
  const router = useRouter();
  const mounted = useRef(false);
  const navigating = useRef(false);
  useEffect(() => { mounted.current = true; navigating.current = false; return () => { mounted.current = false; }; }, []);
  const finishSignIn = useCallback(async () => {
    try { await waitForAccountTransition(); } catch { return; }
    const user = getBrowserAuth()?.currentUser;
    if (!mounted.current || navigating.current || !user || user.isAnonymous || hasPendingAccountTransfer() || hasEmailSignInLink()) return;
    navigating.current = true;
    router.replace("/saved");
  }, [router]);
  useEffect(() => { if (state === "signed-in") void finishSignIn(); }, [state, finishSignIn]);
  if (state === "checking" || state === "signed-in") return <SavedDatesLoading />;
  return <AuthScreen open signedIn={false} onOpenChange={(open) => { if (!open) { navigating.current = true; router.replace("/"); } }}>
    <AccountAccess onDone={() => void finishSignIn()} />
  </AuthScreen>;
}
