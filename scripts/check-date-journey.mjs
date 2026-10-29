import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

await mkdir(join(process.cwd(), ".vercel"), { recursive: true });
const directory = await mkdtemp(join(process.cwd(), ".vercel", "date-journey-test-"));
try {
  const output = join(directory, "check.mjs");
  await build({ entryPoints: ["tests/integration/date-journey.ts"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", conditions: ["react-server"], alias: { "server-only": "./scripts/empty-server-only.mjs" }, tsconfig: "tsconfig.json" });
  const result = spawnSync(process.execPath, [output], { stdio: "inherit", env: { ...process.env, FIREBASE_PROJECT_ID: "demo-date-atlas", GCLOUD_PROJECT: "demo-date-atlas", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_MAPS_SERVER_KEY: "test-only-maps-key", DEEPSEEK_API_KEY: "", DATE_ATLAS_FUNCTIONS_URL: "", DATE_ATLAS_FUNCTIONS: "1", DATE_ATLAS_CATALOG_MODE: "live", PLANNER_RATE_LIMIT_SECRET: "test-only-invitation-limit" } });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
