import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

type Harness = {
  accountActionContinuePath: (value: string | null) => string;
  accountActionFailure: (error: unknown) => { message: string; retryable: boolean };
  checkAccountEmailAction: (auth: object, mode: string, code: string) => Promise<string | null>;
  fixture: { operation: string; checks: string[]; resets: string[]; mutations: string[] };
};

test("branded account actions validate their operation and keep continuation on the app", async (t) => {
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "account-action-test-"));
  const services: Record<string, string> = {
    "next/navigation": "export const useSearchParams = () => new URLSearchParams();",
    "next/link": "export default () => null;",
    "@/components/ui/button": "export const Button = () => null;",
    "@/lib/firebase/client": "export const getBrowserAuth = () => null;",
    "./account-email-action.module.css": "export default {};",
    "account-action-fixture": 'export const fixture = { operation: "VERIFY_EMAIL", checks: [], resets: [], mutations: [] };',
    "firebase/auth": `
      import { fixture } from "account-action-fixture";
      export const ActionCodeOperation = { PASSWORD_RESET: "PASSWORD_RESET", VERIFY_EMAIL: "VERIFY_EMAIL", RECOVER_EMAIL: "RECOVER_EMAIL", VERIFY_AND_CHANGE_EMAIL: "VERIFY_AND_CHANGE_EMAIL", REVERT_SECOND_FACTOR_ADDITION: "REVERT_SECOND_FACTOR_ADDITION" };
      export async function verifyPasswordResetCode(_auth, code) { fixture.resets.push(code); return "person@example.com"; }
      export async function checkActionCode(_auth, code) { fixture.checks.push(code); return { operation: fixture.operation, data: { email: "person@example.com" } }; }
      export async function applyActionCode(_auth, code) { fixture.mutations.push(code); }
      export async function confirmPasswordReset(_auth, code) { fixture.mutations.push(code); }
    `,
  };
  try {
    const output = join(directory, "account-action.mjs");
    await build({
      stdin: { contents: 'export { accountActionContinuePath, accountActionFailure, checkAccountEmailAction } from "./components/date-atlas/account-email-action"; export { fixture } from "account-action-fixture";', resolveDir: process.cwd() },
      outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", logLevel: "silent",
      plugins: [{ name: "account-action-fixtures", setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "action-fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "action-fixture" }, (args) => ({ contents: services[args.path], loader: "js" }));
      } }],
    });
    const harness: Harness = await import(pathToFileURL(output).href);
    await t.test("checking links never consumes them and rejects a different operation", async () => {
      assert.equal(await harness.checkAccountEmailAction({}, "resetPassword", "reset-fixture"), "person@example.com");
      for (const [mode, operation] of [["verifyEmail", "VERIFY_EMAIL"], ["recoverEmail", "RECOVER_EMAIL"], ["verifyAndChangeEmail", "VERIFY_AND_CHANGE_EMAIL"], ["revertSecondFactorAddition", "REVERT_SECOND_FACTOR_ADDITION"]]) {
        harness.fixture.operation = operation;
        assert.equal(await harness.checkAccountEmailAction({}, mode, "action-fixture"), "person@example.com");
      }
      harness.fixture.operation = "VERIFY_EMAIL";
      await assert.rejects(harness.checkAccountEmailAction({}, "recoverEmail", "wrong-mode-fixture"), /account-action-mismatch/);
      assert.deepEqual(harness.fixture.resets, ["reset-fixture"]);
      assert.equal(harness.fixture.checks.length, 5);
      assert.deepEqual(harness.fixture.mutations, []);
    });
    await t.test("continuations retain the planner flow without tokens or external destinations", () => {
      const flow = "123e4567-e89b-42d3-a456-426614174000";
      assert.equal(harness.accountActionContinuePath(`https://adateatlas.com/plan?flow=${flow}&oobCode=fixture-secret&apiKey=fixture-key`), `/plan?flow=${flow}`);
      assert.equal(harness.accountActionContinuePath("https://date-atlas.vercel.app/saved?return=https://elsewhere.example/"), "/saved");
      assert.equal(harness.accountActionContinuePath("https://adateatlas.com/plan?flow=not-a-uuid"), "/plan");
      for (const destination of [null, "not-a-url", "javascript:alert(1)", "https://adateatlas.com.attacker.example/", "https://user:password@adateatlas.com/saved", "https://adateatlas.com/auth/action", "https://adateatlas.com/auth/manage", "https://adateatlas.com/api/account/merge"]) {
        assert.equal(harness.accountActionContinuePath(destination), "/login", String(destination));
      }
    });
    await t.test("expired codes request a new link and network or password failures stay retryable", () => {
      for (const code of ["auth/expired-action-code", "auth/invalid-action-code"]) assert.equal(harness.accountActionFailure({ code }).retryable, false);
      assert.match(harness.accountActionFailure({ code: "auth/network-request-failed" }).message, /internet connection/);
      assert.equal(harness.accountActionFailure({ code: "auth/password-does-not-meet-requirements" }).retryable, true);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
