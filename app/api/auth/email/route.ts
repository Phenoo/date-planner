import { createHmac } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { accountEmailSchema, accountEmailMessage } from "@/lib/firebase/email-actions";
import { getFirebaseAdmin, getDatabase } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { siteOrigin } from "@/lib/seo/site";

export async function POST(request: Request) {
  try {
    if (![siteOrigin, "https://date-atlas.vercel.app"].includes(request.headers.get("origin") ?? "")) throw new RequestError("Please request this email from A Date At las.", 403);
    const parsed = accountEmailSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Please check your email address.", 400);
    const key = process.env.RESEND_API_KEY;
    const limitSecret = process.env.PLANNER_RATE_LIMIT_SECRET;
    if (!key || !limitSecret) throw new RequestError("Account emails are temporarily unavailable. Please try again shortly.", 503);
    await enforcePlannerLimit(request, "email");
    const recipient = createHmac("sha256", limitSecret).update(`account-email:${parsed.data.email.toLowerCase()}`).digest("hex");
    const db = getDatabase();
    await db.runTransaction(async (transaction) => {
      const ref = db.collection("plannerLimits").doc(recipient);
      const record = (await transaction.get(ref)).data();
      const now = Date.now();
      const current = record?.resetAt instanceof Timestamp && record.resetAt.toMillis() > now;
      const count = current && typeof record?.count === "number" ? record.count : 0;
      if (count >= 3) throw new RequestError("Several emails have already been requested. Use the latest link or try again later.", 429);
      transaction.set(ref, { count: count + 1, resetAt: current ? record.resetAt : Timestamp.fromMillis(now + 3600000), expiresAt: Timestamp.fromMillis(now + 86400000) });
    });
    const auth = getAuth(getFirebaseAdmin());
    const settings = { url: new URL(parsed.data.returnPath, siteOrigin).href, handleCodeInApp: parsed.data.intent === "signIn" };
    let link: string;
    try {
      link = parsed.data.intent === "signIn"
        ? await auth.generateSignInWithEmailLink(parsed.data.email, settings)
        : await auth.generatePasswordResetLink(parsed.data.email, settings);
    } catch (error) {
      if (parsed.data.intent === "resetPassword" && error && typeof error === "object" && "code" in error && ["auth/user-not-found", "auth/user-disabled"].includes(String(error.code))) return Response.json({ sent: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
      throw error;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `account-email/${crypto.randomUUID()}` },
      body: JSON.stringify(accountEmailMessage(parsed.data, link)),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    await response.body?.cancel();
    if (!response.ok) throw new RequestError("We couldn't send that email. Please try again shortly or sign in with Google.", response.status === 429 ? 429 : 503);
    return Response.json({ sent: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
