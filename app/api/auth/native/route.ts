import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase, getFirebaseAdmin } from "@/lib/firebase/server";
import { nativeAuthLifetimeMs, nativeAuthRequestSchema, nativeAuthSecretSchema } from "@/lib/firebase/native-auth";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const sessionSchema = z.object({ challenge: nativeAuthSecretSchema, expiresAt: z.instanceof(Timestamp), uid: z.string().min(1).max(128).optional(), codeHash: nativeAuthSecretSchema.optional() });

function readSession(value: unknown) {
  const session = sessionSchema.safeParse(value);
  if (!session.success || session.data.expiresAt.toMillis() <= Date.now()) throw new RequestError("This sign-in has expired. Return to the app and try again.", 410);
  return session.data;
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new RequestError("Please start sign-in from A Date At las.", 403);
    const parsed = nativeAuthRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("This sign-in request is invalid. Please try again.", 400);
    await enforcePlannerLimit(request, "authentication");
    const input = parsed.data;
    const db = getDatabase();
    if (input.action === "start") {
      const sessionId = randomBytes(32).toString("hex");
      await db.collection("nativeAuthSessions").doc(sessionId).create({ challenge: input.challenge, expiresAt: Timestamp.fromMillis(Date.now() + nativeAuthLifetimeMs) });
      return Response.json({ sessionId }, { headers });
    }
    const ref = db.collection("nativeAuthSessions").doc(input.sessionId);
    if (input.action === "complete") {
      const auth = await authenticatedClient(request);
      if (!auth || auth.user.firebase.sign_in_provider !== "google.com" || typeof auth.user.auth_time !== "number" || Date.now() - auth.user.auth_time * 1000 > nativeAuthLifetimeMs) throw new RequestError("Please sign in with Google again to continue.", 401);
      const code = randomBytes(32).toString("hex");
      const codeHash = createHash("sha256").update(code).digest("hex");
      await db.runTransaction(async transaction => {
        const session = readSession((await transaction.get(ref)).data());
        if (session.uid && session.uid !== auth.user.uid) throw new RequestError("This sign-in has already finished. Return to the app and try again.", 409);
        transaction.set(ref, { uid: auth.user.uid, codeHash }, { merge: true });
      });
      return Response.json({ code }, { headers });
    }
    const challenge = createHash("sha256").update(input.verifier).digest();
    const session = readSession((await ref.get()).data());
    if (!timingSafeEqual(challenge, Buffer.from(session.challenge, "hex"))) throw new RequestError("This sign-in belongs to another session. Please try again.", 403);
    if (!session.uid || !session.codeHash) throw new RequestError("Google sign-in hasn't finished yet. Return to the app and try again.", 409);
    if (!timingSafeEqual(createHash("sha256").update(input.code).digest(), Buffer.from(session.codeHash, "hex"))) throw new RequestError("This sign-in code is invalid. Please try again.", 403);
    const admin = getAuth(getFirebaseAdmin());
    const user = await admin.getUser(session.uid);
    const deletion = (await db.collection("accountDeletionRequests").doc(createHash("sha256").update(session.uid).digest("hex")).get()).data();
    if (user.disabled || deletion?.status === "processing" || deletion?.status === "complete") throw new RequestError("This account is unavailable. Please try another account.", 403);
    const customToken = await admin.createCustomToken(session.uid);
    await db.runTransaction(async transaction => {
      const current = readSession((await transaction.get(ref)).data());
      if (current.uid !== session.uid || current.challenge !== session.challenge || current.codeHash !== session.codeHash) throw new RequestError("This sign-in has changed. Please try again.", 409);
      transaction.delete(ref);
    });
    return Response.json({ customToken }, { headers });
  } catch (error) {
    const response = apiError(error);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }
}
