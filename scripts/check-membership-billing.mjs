import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

await mkdir(join(process.cwd(), ".vercel"), { recursive: true });
const directory = await mkdtemp(join(process.cwd(), ".vercel", "membership-billing-test-"));
try {
  const output = join(directory, "check.mjs");
  await build({ entryPoints: ["tests/integration/membership-billing.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
    conditions: ["react-server"], alias: { "server-only": "./scripts/empty-server-only.mjs" }, tsconfig: "tsconfig.json" });
  const result = spawnSync(process.execPath, [output], { stdio: "inherit", env: { ...process.env,
    FIREBASE_PROJECT_ID: "demo-date-atlas", GCLOUD_PROJECT: "demo-date-atlas", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", DATE_ATLAS_FUNCTIONS_URL: "", DATE_ATLAS_FUNCTIONS: "",
    DATE_ATLAS_BILLING_MODE: "test", DATE_ATLAS_BILLING_ORIGIN: "http://localhost:3005", VERCEL_ENV: "preview",
    PAYSTACK_SECRET_KEY: "sk_test_emulator-only", PAYSTACK_PLUS_MONTHLY_PLAN: "PLN_emulator_only", PAYSTACK_WEBHOOK_SECRET: "",
    POLAR_ACCESS_TOKEN: "emulator-only-token", POLAR_PLUS_MONTHLY_PRODUCT: "product_emulator_only", POLAR_WEBHOOK_SECRET: "whsec_emulator-only",
  } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
