import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (existsSync(".env.subscription-test.local")) process.loadEnvFile(".env.subscription-test.local");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3005"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VERCEL_ENV: "development", DATE_ATLAS_BILLING_MODE: "test", NEXT_PUBLIC_DATE_ATLAS_MEMBERSHIP_TEST: "1",
    DATE_ATLAS_BILLING_ORIGIN: process.env.DATE_ATLAS_BILLING_ORIGIN || "http://localhost:3005",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-date-atlas", NEXT_PUBLIC_FIREBASE_API_KEY: "emulator-only",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost", NEXT_PUBLIC_FIREBASE_APP_ID: "emulator-only",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099", NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
    FIREBASE_PROJECT_ID: "demo-date-atlas", GCLOUD_PROJECT: "demo-date-atlas", GOOGLE_CLOUD_PROJECT: "demo-date-atlas",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
    DATE_ATLAS_FUNCTIONS_URL: "", DATE_ATLAS_FUNCTIONS: "", DATE_ATLAS_CATALOG_MODE: "demo",
    DEEPSEEK_API_KEY: "", GOOGLE_MAPS_SERVER_KEY: "", NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY: "",
    RESEND_API_KEY: "", NEXT_PUBLIC_GA_MEASUREMENT_ID: "", APP_ORIGIN: "http://localhost:3005",
    PLANNER_RATE_LIMIT_SECRET: "local-membership-test-only",
  },
});
child.on("error", () => { console.error("The local membership preview couldn't start."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
