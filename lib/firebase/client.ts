"use client";
import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
} from "firebase/auth";

const emailKey = "date-atlas:sign-in-email";
let completingLink: Promise<void> | null = null;

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
  if (emulator && projectId.startsWith("demo-") && typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && !auth.emulatorConfig) connectAuthEmulator(auth, emulator);
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

export async function completeEmailSignIn(email: string) {
  const auth = getBrowserAuth();
  if (!auth || !hasEmailSignInLink()) return false;
  if (!completingLink) {
    const url = window.location.href;
    completingLink = signInWithEmailLink(auth, email, url)
      .then(() => {
        try {
          localStorage.removeItem(emailKey);
        } catch {
          /* Sign-in can finish without storage. */
        }
        const clean = new URL(window.location.href);
        for (const key of ["apiKey", "oobCode", "mode", "lang", "auth"])
          clean.searchParams.delete(key);
        window.history.replaceState(window.history.state, "", clean);
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
      "Account sign-in is being connected. You can still plan and save on this device.",
    );
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/?auth=email`,
    handleCodeInApp: true,
  });
  try {
    localStorage.setItem(emailKey, email);
  } catch {
    /* The email can be entered again on return. */
  }
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
  if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") return "That account already exists. Choose Sign in; your guest plans are safe.";
  if (code === "auth/popup-closed-by-user") return "Sign-in was closed. You can try again whenever you're ready.";
  if (code === "auth/invalid-email") return "Please check your email address.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait a little before trying again.";
  if (
    code === "auth/unauthorized-domain" ||
    code === "auth/operation-not-allowed"
  )
    return "Email sign-in needs to be enabled for this website in Firebase.";
  return "We couldn't complete sign-in. Please try again.";
}
