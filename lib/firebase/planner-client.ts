"use client";
import { signInAnonymously } from "firebase/auth";
import { getBrowserAuth, getAuthToken } from "./client";
let guestSignIn: Promise<unknown> | null = null;
export async function planningToken() {
  const auth = getBrowserAuth();
  if (!auth) return null;
  await auth.authStateReady();
  if (!auth.currentUser) {
    guestSignIn ??= signInAnonymously(auth).finally(() => { guestSignIn = null; });
    await guestSignIn;
  }
  return getAuthToken();
}
export async function plannerFetch(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token = await getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
export async function readPlanningResponse(response: Response, progress: (stage: string) => void) {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The planning service is temporarily unavailable. Your answers are safe; please try again shortly.");
    const data: unknown = await response.json();
    if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Planning couldn't finish. Please retry.");
    return data;
  }
  if (!response.body) throw new Error("Planning was interrupted. Your answers are safe; please retry.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let result: unknown;
  try {
    while (true) {
      const part = await reader.read(); buffer += decoder.decode(part.value, { stream: !part.done });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (!line.trim()) continue;
        const event: unknown = JSON.parse(line);
        if (!event || typeof event !== "object" || !("type" in event)) continue;
        if (event.type === "stage" && "stage" in event && typeof event.stage === "string") progress(event.stage);
        if (event.type === "result" && "data" in event) {
          if ("status" in event && typeof event.status === "number" && event.status >= 400) {
            const data = event.data; throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Planning couldn't finish. Please retry.");
          }
          result = event.data;
        }
      }
      if (part.done) break;
    }
    if (!result) throw new Error("Planning was interrupted. Your answers are safe; please retry.");
    return result;
  } finally { reader.releaseLock(); }
}
