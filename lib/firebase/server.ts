import "server-only";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { RequestError } from "@/lib/planner/http";
import { createHash } from "node:crypto";

export function getFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId)
    throw new RequestError(
      "The database is being connected. Please try again shortly.",
      503,
    );
  const existing = getApps().find((app) => app.name === "date-atlas");
  if (existing) return existing;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return initializeApp(
    {
      projectId,
      credential:
        clientEmail && privateKey
          ? cert({ projectId, clientEmail, privateKey })
          : applicationDefault(),
    },
    "date-atlas",
  );
}

export const getDatabase = () => getFirestore(getFirebaseAdmin());

export async function authenticatedClient(request: Request) {
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ") || bearer.length > 10000) return null;
  const auth = getAuth(getFirebaseAdmin());
  try {
    const user = await auth.verifyIdToken(bearer.slice(7), true);
    const deletion = await getDatabase().collection("accountDeletionRequests").doc(createHash("sha256").update(user.uid).digest("hex")).get();
    if (deletion.data()?.status === "processing" || deletion.data()?.status === "complete") return null;
    return { user, db: getDatabase() };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? error.code : "";
    if (
      typeof code === "string" &&
      [
        "auth/argument-error",
        "auth/id-token-expired",
        "auth/id-token-revoked",
        "auth/invalid-id-token",
        "auth/user-disabled",
        "auth/user-not-found",
      ].includes(code)
    )
      return null;
    throw new RequestError(
      "Account services are temporarily unavailable. Please try again.",
      503,
    );
  }
}
