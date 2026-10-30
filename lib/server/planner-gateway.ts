import "server-only";
import { GoogleAuth } from "google-auth-library";
import { generate } from "./actions/generate";
import { chat } from "./actions/chat";
import { customize } from "./actions/customize";
import { swap } from "./actions/swap";
import { restore } from "./actions/restore";
import { locate } from "./actions/location";
import { places } from "./actions/places";
import { invitations } from "./actions/invitations";
import { dateHistory } from "./actions/date-history";
import { conversation } from "./actions/conversation";
import { intake } from "./actions/intake";
import { apiError, RequestError } from "@/lib/planner/http";
export const plannerActions = { generate, chat, customize, swap, restore, locate, places, invitations, dateHistory, conversation, intake };
export type PlannerAction = keyof typeof plannerActions;
let googleAuth: GoogleAuth | null = null;
export async function plannerAction(action: PlannerAction, request: Request) {
  const endpoint = process.env.DATE_ATLAS_FUNCTIONS_URL;
  if (!endpoint) return plannerActions[action](request);
  try {
    const body = await request.text();
    if (body.length > 18000) throw new RequestError("This request is too large.", 413);
    googleAuth ??= new GoogleAuth({ ...(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? { credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL, private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    } } : {}) });
    const client = await googleAuth.getIdTokenClient(endpoint);
    const headers = await client.getRequestHeaders(endpoint);
    const outgoing = new Headers();
    headers.forEach((value, key) => outgoing.set(key, value));
    outgoing.set("Content-Type", "application/json");
    outgoing.set("Accept", request.headers.get("accept") || "application/json");
    const requestKey = request.headers.get("idempotency-key");
    if (requestKey) outgoing.set("idempotency-key", requestKey);
    const userToken = request.headers.get("authorization");
    if (userToken) outgoing.set("x-atlas-user-token", userToken);
    const appCheck = request.headers.get("x-firebase-appcheck");
    if (appCheck) outgoing.set("x-firebase-appcheck", appCheck);
    outgoing.set("x-atlas-client-ip", process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local");
    const response = await fetch(`${endpoint}?action=${action}`, { method: "POST", headers: outgoing, body, signal: AbortSignal.any([request.signal, AbortSignal.timeout(action === "locate" ? 15000 : 65000)]) });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json") && !contentType.includes("application/x-ndjson")) {
      await response.body?.cancel();
      throw new RequestError("The planning service is temporarily unavailable. Your answers are safe; please try again shortly.", 503);
    }
    return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store, no-transform" } });
  } catch (error) { return apiError(error); }
}
