import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3004", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-date-atlas",
    NEXT_PUBLIC_FIREBASE_API_KEY: "emulator-only",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIREBASE_APP_ID: "emulator-only",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
    FIREBASE_PROJECT_ID: "demo-date-atlas",
    GCLOUD_PROJECT: "demo-date-atlas",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_CLIENT_EMAIL: "",
    FIREBASE_PRIVATE_KEY: "",
    GOOGLE_APPLICATION_CREDENTIALS: "",
    DATE_ATLAS_FUNCTIONS_URL: "",
    DATE_ATLAS_FUNCTIONS: "",
    DATE_ATLAS_CATALOG_MODE: "demo",
    DEEPSEEK_API_KEY: "",
    GOOGLE_MAPS_SERVER_KEY: "",
    NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY: "",
    PLANNER_RATE_LIMIT_SECRET: "local-demo-only",
  },
});
child.on("error", (error) => { console.error("Local demo couldn't start:", error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
