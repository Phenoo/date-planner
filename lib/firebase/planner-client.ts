"use client";
import { ensurePlanningIdentity, getAuthToken, waitForAccountTransition } from "./client";

function identityWait<T>(operation: () => Promise<T>, signal?: AbortSignal | null): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return operation();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    // Firebase calls cannot be canceled; observe late failures without continuing the request.
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

export async function planningToken(signal?: AbortSignal) {
  await identityWait(ensurePlanningIdentity, signal);
  return identityWait(getAuthToken, signal);
}
export async function plannerFetch(url: string, init?: RequestInit) {
  await identityWait(waitForAccountTransition, init?.signal);
  const headers = new Headers(init?.headers);
  const token = await identityWait(getAuthToken, init?.signal);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  init?.signal?.throwIfAborted();
  return fetch(url, { ...init, headers });
}
export class PlanningRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function readPlanningResponse(response: Response, progress: (stage: string) => void) {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The planning service is temporarily unavailable. Your answers are safe; please try again shortly.");
    const data: unknown = await response.json();
    if (!response.ok) throw new PlanningRequestError(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Planning couldn't finish. Please retry.", response.status);
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
            const data = event.data; throw new PlanningRequestError(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Planning couldn't finish. Please retry.", event.status);
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
