import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canUseGoogleSignIn, subscribeGoogleSignIn } from "../lib/firebase/provider-availability";

test("Google is available in browsers and apps with a supported return bridge", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  await mkdir(".vercel", { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), ".vercel", "account-provider-test-"));
  const services: Record<string, string> = {
    react: 'export * from "actual-react"; export const useSyncExternalStore = (_subscribe, getSnapshot) => getSnapshot();',
    "next/image": 'import { createElement } from "actual-react"; export default ({ unoptimized, ...props }) => createElement("img", props);',
    "next/link": 'import { createElement } from "actual-react"; export default (props) => createElement("a", props);',
    "@/components/ui/button": 'import { createElement } from "actual-react"; export const Button = (props) => createElement("button", props);',
    "@/lib/firebase/client": 'export const getBrowserAuth = () => null; export const hasPendingAccountTransfer = () => false; export const hasEmailSignInLink = () => false; export const authenticateAccount = () => {}; export const completeEmailSignIn = () => false; export const sendEmailSignIn = () => {}; export const sendAccountPasswordReset = () => {}; export const authErrorMessage = () => "";',
    "./auth-screen.module.css": "export default {};",
  };
  try {
    const output = join(directory, "account.mjs");
    await build({
      entryPoints: ["components/date-atlas/account-access.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", logLevel: "silent",
      plugins: [{ name: "account-provider-fixtures", setup(builder) {
        builder.onResolve({ filter: /^actual-react$/ }, () => ({ path: "react", external: true }));
        builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(services, args.path) ? { path: args.path, namespace: "provider-fixture" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "provider-fixture" }, (args) => ({ contents: services[args.path], loader: "js" }));
      } }],
    });
    const { AccountAccess }: { AccountAccess: (props: { onDone: () => void }) => React.ReactNode } = await import(pathToFileURL(output).href);
    for (const fixture of [
      { name: "iPhone app", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15", platform: "iPhone", touch: 1, native: true, google: true },
      { name: "iPad app with desktop user agent", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15", platform: "MacIntel", touch: 5, native: true, google: true },
      { name: "iPhone Safari", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15", platform: "iPhone", touch: 1, native: false, google: true },
      { name: "Android app", userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36", platform: "Linux armv8l", touch: 5, native: true, google: true },
      { name: "desktop browser", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15", platform: "MacIntel", touch: 0, native: false, google: true },
    ]) await t.test(fixture.name, () => {
      Object.defineProperty(globalThis, "window", { configurable: true, value: fixture.native ? { ReactNativeWebView: { postMessage() {} }, __dateAtlasNativeAuth: true } : {} });
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: fixture.userAgent, platform: fixture.platform, maxTouchPoints: fixture.touch } });
      assert.equal(canUseGoogleSignIn(), fixture.google);
      const markup = renderToStaticMarkup(createElement(AccountAccess, { onDone() {} }));
      assert.equal(markup.includes("Continue with Google"), fixture.google);
      assert.equal(markup.includes("or continue with email"), fixture.google);
      assert.match(markup, /type="email"/);
      assert.match(markup, /type="password"/);
      assert.match(markup, /Create an account/);
      assert.match(markup, /Use a secure email link instead/);
    });
    await t.test("older app builds keep Google hidden until the native return bridge is ready", () => {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { ReactNativeWebView: { postMessage() {} } } });
      assert.equal(canUseGoogleSignIn(), false);
      const markup = renderToStaticMarkup(createElement(AccountAccess, { onDone() {} }));
      assert.ok(!markup.includes("Continue with Google"));
      assert.match(markup, /type="email"/);
    });
    await t.test("Google becomes available when the injected bridge is ready and its listener is cleaned up", () => {
      const target = Object.assign(new EventTarget(), { ReactNativeWebView: { postMessage() {} }, __dateAtlasNativeAuth: false });
      Object.defineProperty(globalThis, "window", { configurable: true, value: target });
      let notifications = 0;
      const cleanup = subscribeGoogleSignIn(() => notifications++);
      assert.equal(canUseGoogleSignIn(), false);
      target.__dateAtlasNativeAuth = true;
      target.dispatchEvent(new Event("dateatlas:native-ready"));
      assert.equal(canUseGoogleSignIn(), true);
      assert.equal(notifications, 1);
      cleanup(); target.dispatchEvent(new Event("dateatlas:native-ready"));
      assert.equal(notifications, 1);
    });
    await t.test("server rendering does not expose Google before the native context is known", () => {
      Reflect.deleteProperty(globalThis, "window");
      assert.equal(canUseGoogleSignIn(), false);
      const markup = renderToStaticMarkup(createElement(AccountAccess, { onDone() {} }));
      assert.ok(!markup.includes("Continue with Google"));
    });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    await rm(directory, { recursive: true, force: true });
  }
});
