import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

nextEnv.loadEnvConfig(process.cwd());
const email = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!email || !email.includes("@")) throw new Error("Usage: npm run admin:grant -- account@example.com [--revoke]");
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
try {
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: !revoke });
  console.log(`Administrator access ${revoke ? "removed" : "granted"}. Sign out and back in to refresh the token.`);
} finally {
  await deleteApp(app);
}
