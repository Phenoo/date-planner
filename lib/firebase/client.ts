"use client";
import { FirebaseError, getApps, initializeApp } from "firebase/app";
import { z } from "zod";
import {
  getAuth,
  connectAuthEmulator,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";

const emailKey = "date-atlas:sign-in-email";
let pendingTransfer: { guestToken: string; uid: string; destination?: string } | null = null;
let accountTransition: Promise<void> | null = null;
let guestSignIn: Promise<unknown> | null = null;
let completingLink: Promise<void> | null = null;
const transferListeners = new Set<() => void>();

export async function waitForAccountTransition() { await accountTransition; }
export function hasPendingAccountTransfer() { return !!pendingTransfer?.destination && pendingTransfer.destination === getBrowserAuth()?.currentUser?.uid; }
export function subscribeAccountTransfer(notify: () => void) {
  transferListeners.add(notify);
  return () => { transferListeners.delete(notify); };
}

export async function ensurePlanningIdentity() {
  await waitForAccountTransition();
  const auth = getBrowserAuth();
  if (!auth) return;
  await auth.authStateReady();
  if (!auth.currentUser) {
    guestSignIn ??= signInAnonymously(auth).finally(() => { guestSignIn = null; });
    await guestSignIn;
  }
}

// Auth listeners fire before guest records have moved to the permanent account.
export function authenticateAccount(signIn: (auth: Auth, guest: User | null) => Promise<unknown>, resumeTransfer = false) {
  if (accountTransition) return accountTransition;
  accountTransition = Promise.resolve().then(async () => {
    const auth = getBrowserAuth();
    if (!auth) throw new Error("Account services aren't available. Please try again later.");
    await auth.authStateReady();
    await guestSignIn;
    const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
    if (guest) pendingTransfer = { uid: guest.uid, guestToken: await guest.getIdToken() };
    const retry = resumeTransfer && !!pendingTransfer?.destination && pendingTransfer.destination === auth.currentUser?.uid && !guest;
    if (!retry) await signIn(auth, guest);
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error("Sign-in didn't finish. Please try again.");
    const transfer = pendingTransfer;
    if (transfer && transfer.uid !== user.uid) {
      if (transfer.destination && transfer.destination !== user.uid) {
        pendingTransfer = null;
        throw new Error("Your account changed. Reopen this account's dates to continue.");
      }
      transfer.destination = user.uid;
      const token = await user.getIdToken();
      if (auth.currentUser?.uid !== user.uid) { pendingTransfer = null; throw new Error("Your account changed. Sign in again to continue."); }
      const response = await fetch("/api/account/merge", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ guestToken: transfer.guestToken }), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("You're signed in, but your date couldn't be transferred. Retry sign-in to finish keeping it with your account.");
    }
    if (auth.currentUser?.uid !== user.uid) { pendingTransfer = null; throw new Error("Your account changed. Sign in again to continue."); }
    pendingTransfer = null;
  }).finally(() => { accountTransition = null; transferListeners.forEach((notify) => notify()); });
  return accountTransition;
}

export function getBrowserAuth() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  const app =
    getApps().find((item) => item.name === "date-atlas") ??
    initializeApp(
      {
        apiKey,
        authDomain,
        projectId,
        appId,
      },
      "date-atlas",
    );
  const auth = getAuth(app);
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  if (emulator && projectId.startsWith("demo-") && typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && !auth.emulatorConfig) connectAuthEmulator(auth, emulator, { disableWarnings: true });
  return auth;
}

export async function getAuthToken() {
  const auth = getBrowserAuth();
  if (!auth) return null;
  await auth.authStateReady();
  return auth.currentUser?.getIdToken() ?? null;
}

export function hasEmailSignInLink() {
  if (typeof window === "undefined") return false;
  const auth = getBrowserAuth();
  return !!auth && isSignInWithEmailLink(auth, window.location.href);
}

export function storedSignInEmail() {
  try {
    return localStorage.getItem(emailKey);
  } catch {
    return null;
  }
}

function clearEmailLink() {
  const clean = new URL(window.location.href);
  for (const key of ["apiKey", "oobCode", "mode", "lang", "auth"]) clean.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", clean);
}

export async function completeEmailSignIn(email: string) {
  const auth = getBrowserAuth();
  if (!auth || !hasEmailSignInLink()) return false;
  if (!completingLink) {
    const url = window.location.href;
    completingLink = (async () => {
      await authenticateAccount((current) => signInWithEmailLink(current, email.trim(), url), true);
        try {
          localStorage.removeItem(emailKey);
        } catch {
          /* Sign-in can finish without storage. */
        }
        clearEmailLink();
      })()
      .catch((failure: unknown) => {
        const code = failure && typeof failure === "object" && "code" in failure ? failure.code : "";
        if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") clearEmailLink();
        throw failure;
      })
      .finally(() => {
        completingLink = null;
      });
  }
  await completingLink;
  return true;
}

export async function sendEmailSignIn(email: string) {
  const auth = getBrowserAuth();
  if (!auth)
    throw new Error(
      "Account sign-in is unavailable. You can still plan; sign in when account services return to save your date.",
    );
  await requestAccountEmail(email, "signIn");
  try {
    localStorage.setItem(emailKey, email);
  } catch {
    /* The email can be entered again on return. */
  }
}

export async function sendAccountPasswordReset(email: string) {
  await requestAccountEmail(email, "resetPassword");
}

async function requestAccountEmail(email: string, intent: "signIn" | "resetPassword") {
  const path = window.location.pathname === "/login" ? "/saved" : window.location.pathname;
  const returnPath = ["/", "/plan", "/saved", "/favorites", "/profile"].includes(path) ? path : "/";
  const flow = intent === "signIn" && returnPath === "/plan" ? z.uuid().safeParse(new URLSearchParams(window.location.search).get("flow")) : null;
  const response = await fetch("/api/auth/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), intent, returnPath, ...(flow?.success ? { flow: flow.data } : {}) }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new FirebaseError(response.status === 429 ? "auth/too-many-requests" : response.status === 400 ? "auth/invalid-email" : "auth/internal-error", "We couldn't send that email. Please try again shortly.");
}

export function authErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : "";
  if (
    code === "auth/expired-action-code" ||
    code === "auth/invalid-action-code"
  )
    return "This sign-in link has expired or was already used. Request a new link.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") return "Email or password isn't correct. Please try again.";
  if (code === "auth/user-not-found") return "Email or password isn't correct. Please try again.";
  if (code === "auth/weak-password") return "Choose a password with at least six characters.";
  if (code === "auth/network-request-failed") return "Couldn't connect. Check your internet connection and try again.";
  if (code === "auth/popup-blocked") return "Your browser blocked sign-in. Allow the pop-up or use email and password.";
  if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") return "That account already exists. Choose Sign in; your guest plans are safe.";
  if (code === "auth/popup-closed-by-user") return "Sign-in was closed. You can try again whenever you're ready.";
  if (code === "auth/invalid-email") return "Please check your email address.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait a little before trying again.";
  if (
    code === "auth/unauthorized-domain" ||
    code === "auth/operation-not-allowed"
  )
    return code === "auth/unauthorized-domain" ? "This website's domain isn't authorized for sign-in in Firebase. Please contact support." : "This sign-in method isn't enabled in Firebase. Please try another method or contact support.";
  if (error instanceof Error && !code) return error.message;
  return "We couldn't complete sign-in. Please try again.";
}
