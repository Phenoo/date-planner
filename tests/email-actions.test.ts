import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/auth/action/route";
import { accountEmailMessage, accountEmailSchema } from "../lib/firebase/email-actions";

test("Resend account emails use the public brand and only a safe return path", () => {
  for (const intent of ["signIn", "resetPassword"] as const) {
    const input = accountEmailSchema.parse({ email: "  qa@example.com  ", intent, returnPath: "/saved" });
    const message = accountEmailMessage(input, `https://project.firebaseapp.com/__/auth/action?mode=${intent}&oobCode=one-time-code&apiKey=wrong-maps-key&continueUrl=https://attacker.example`);
    assert.equal(message.from, "A Date Atlas <noreply@adateatlas.com>");
    assert.equal(message.reply_to, "support@adateatlas.com");
    assert.deepEqual(message.to, ["qa@example.com"]);
    assert.match(message.subject, /A Date Atlas/);
    assert.ok(!message.text.includes("wrong-maps-key"));
    assert.ok(!message.text.includes("attacker.example"));
    const link = new URL(message.text.split("\n").find((line) => line.startsWith("https://")) ?? "");
    assert.equal(link.origin, "https://adateatlas.com");
    assert.equal(link.pathname, "/auth/action");
    assert.equal(link.searchParams.get("oobCode"), "one-time-code");
    assert.equal(link.searchParams.get("mode"), intent);
    const destination = new URL(link.searchParams.get("continueUrl") ?? "");
    assert.equal(destination.origin, "https://adateatlas.com");
    assert.equal(destination.pathname, "/saved");
    assert.equal(destination.searchParams.get("auth"), intent === "signIn" ? "email" : null);
    assert.throws(() => accountEmailMessage(input, "https://project.firebaseapp.com/?mode=unknown&oobCode=code"));
    assert.throws(() => accountEmailMessage(input, `https://project.firebaseapp.com/?mode=${intent}`));
  }
  for (const returnPath of ["//attacker.example", "https://attacker.example", "/auth/action", "/api/account/privacy"]) {
    assert.equal(accountEmailSchema.safeParse({ email: "qa@example.com", intent: "signIn", returnPath }).success, false);
  }
  assert.equal(accountEmailSchema.safeParse({ email: "qa@example.com", intent: "unsupported" }).success, false);
  assert.equal(accountEmailSchema.safeParse({ email: "bad-address", intent: "signIn" }).success, false);
});

test("email actions use the configured Firebase key and preserve the one-time code", () => {
  const previousKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const previousProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  try {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "firebase-auth-key";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "test-date-atlas";
    for (const mode of ["signIn", "resetPassword", "verifyEmail", "recoverEmail", "verifyAndChangeEmail", "revertSecondFactorAddition"]) {
      const input = new URL("https://adateatlas.com/auth/action");
      input.search = new URLSearchParams({ mode, oobCode: "one-time-code", apiKey: "wrong-maps-key", continueUrl: "https://adateatlas.com/plan?auth=email", lang: "en" }).toString();
      const response = GET(new Request(input));
      assert.equal(response.status, 303);
      const target = new URL(response.headers.get("Location")!);
      assert.equal(target.origin, "https://test-date-atlas.firebaseapp.com");
      assert.equal(target.pathname, "/__/auth/action");
      assert.equal(target.searchParams.get("apiKey"), "firebase-auth-key");
      assert.equal(target.searchParams.get("oobCode"), "one-time-code");
      assert.equal(target.searchParams.get("mode"), mode);
      assert.equal(target.searchParams.get("continueUrl"), "https://adateatlas.com/plan?auth=email");
      assert.equal(target.searchParams.get("lang"), "en");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
      assert.match(response.headers.get("X-Robots-Tag")!, /noindex/);
    }
    for (const destination of ["https://attacker.example/", "https://adateatlas.com.attacker.example/", "https://user:password@adateatlas.com/", "https://adateatlas.com/auth/action", "javascript:alert(1)", "not-a-url"]) {
      const input = new URL("https://adateatlas.com/auth/action");
      input.search = new URLSearchParams({ mode: "signIn", oobCode: "one-time-code", continueUrl: destination }).toString();
      const response = GET(new Request(input));
      assert.equal(response.status, 400, destination);
      assert.equal(response.headers.get("Location"), null);
    }
    for (const query of ["", "mode=signIn", "mode=unknown&oobCode=code"]) {
      assert.equal(GET(new Request(`https://adateatlas.com/auth/action?${query}`)).status, 400);
    }
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    assert.equal(GET(new Request("https://adateatlas.com/auth/action?mode=signIn&oobCode=code")).status, 503);
  } finally {
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = previousKey;
    if (previousProject === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = previousProject;
  }
});
