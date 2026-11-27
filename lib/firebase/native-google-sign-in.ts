"use client";

import { nativeAuthLifetimeMs, nativeAuthSecretSchema, nativeAuthStartSchema, nativeAuthTokenSchema } from "./native-auth";

async function authRequest(body: unknown) {
  const response = await fetch("/api/auth/native", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Google sign-in couldn't finish. Please try again.");
  return data;
}

function openGoogleSession(sessionId: string) {
  return new Promise<string>((resolve, reject) => {
    const cleanup = () => { window.clearTimeout(timeout); window.removeEventListener("dateatlas:google-sign-in-result", complete); };
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Google sign-in timed out. Please try again.")); }, nativeAuthLifetimeMs);
    function complete(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || !("sessionId" in detail) || detail.sessionId !== sessionId) return;
      cleanup();
      if ("error" in detail && detail.error) reject(new Error(detail.error === "AbortError" ? "Google sign-in was closed. You can try again whenever you're ready." : "Google sign-in couldn't open. Please try again."));
      else {
        const code = nativeAuthSecretSchema.safeParse("code" in detail ? detail.code : undefined);
        if (code.success) resolve(code.data);
        else reject(new Error("Google sign-in returned an invalid code. Please try again."));
      }
    }
    window.addEventListener("dateatlas:google-sign-in-result", complete);
    window.dispatchEvent(new CustomEvent("dateatlas:google-sign-in", { detail: { sessionId } }));
  });
}

export async function nativeGoogleSignIn() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const { sessionId } = nativeAuthStartSchema.parse(await authRequest({ action: "start", challenge }));
  const code = await openGoogleSession(sessionId);
  return nativeAuthTokenSchema.parse(await authRequest({ action: "exchange", sessionId, verifier, code })).customToken;
}
