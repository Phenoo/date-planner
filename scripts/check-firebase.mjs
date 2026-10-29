import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { cert, initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

nextEnv.loadEnvConfig(process.cwd());
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
const projectId = process.env.FIREBASE_PROJECT_ID;
assert.ok(projectId && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY, "Configure the server credentials in .env.local first.");
const app = initializeApp({ credential: cert({
  projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
}) }, `check-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const users = [];
const recipeId = `connection-check-${randomUUID()}`;
const check = db.collection("_connectionChecks").doc();
async function api(path, token, body, method = body ? "POST" : "GET") {
  return fetch(origin + path, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
}
async function makeUser() {
  const user = await auth.createUser({ uid: `connection-check-${randomUUID()}` });
  users.push(user.uid);
  const customToken = await auth.createCustomToken(user.uid);
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=" + process.env.NEXT_PUBLIC_FIREBASE_API_KEY, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `Firebase sign-in rejected: ${data.error?.message || response.status}`);
  return data.idToken;
}
try {
  await check.set({ purpose: "Disposable connection test", checkedAt: new Date() });
  assert.equal((await check.get()).exists, true);
  console.log("PASS Firestore write/read");
  const [a, b] = await Promise.all([makeUser(), makeUser()]);
  const recipe = {
    id: recipeId, title: "Connection check (not a real date)", type: "Best overall match",
    request: { city: "Lagos", area: "Lekki", occasion: "Romantic date", budget: 60000, vibes: ["Romantic"], date: "2026-10-31", startTime: "15:00", duration: 300 },
    experienceIds: ["connection-check"], total: 0, image: "/images/cafe.jpg", demo: true, savedAt: new Date().toISOString(),
  };
  assert.equal((await api("/api/saved-plans", null)).status, 401);
  assert.equal((await api("/api/saved-plans", "invalid-token")).status, 401);
  assert.equal((await api("/api/admin/catalog", a)).status, 403);
  assert.equal((await api("/api/saved-plans", a, recipe)).status, 200);
  const own = await (await api("/api/saved-plans", a)).json();
  const other = await (await api("/api/saved-plans", b)).json();
  assert.ok(own.plans.some((plan) => plan.id === recipeId));
  assert.ok(!other.plans.some((plan) => plan.id === recipeId));
  assert.equal((await api("/api/saved-plans", b, { id: recipeId }, "DELETE")).status, 200);
  const retained = await (await api("/api/saved-plans", a)).json();
  assert.ok(retained.plans.some((plan) => plan.id === recipeId));
  console.log("PASS authenticated saves, user isolation, admin denial, invalid token denial");
  const publicRead = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/experiences?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, { signal: AbortSignal.timeout(20000) });
  assert.equal(publicRead.status, 403);
  console.log("PASS direct browser database access denied by deployed rules");
  assert.equal((await api("/api/saved-plans", a, { id: recipeId }, "DELETE")).status, 200);
  console.log("PASS saved-plan deletion");
} finally {
  const cleanups = await Promise.allSettled([
    check.delete(),
    ...users.map(async (uid) => {
      await db.recursiveDelete(db.collection("users").doc(uid));
      await auth.deleteUser(uid);
    }),
  ]);
  if (cleanups.some((result) => result.status === "rejected")) {
    console.error("Disposable test cleanup failed. Check connection-check users before rerunning.");
    process.exitCode = 1;
  }
  await db.terminate();
  await deleteApp(app);
}
