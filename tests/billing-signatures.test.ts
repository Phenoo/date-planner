import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyPaystackSignature, verifyPaystackWebhook } from "../lib/server/billing-signatures";

const raw = Buffer.from('{"event":"charge.success","data":{"amount":500000}}');
const secret = "whsec_test-only-signing-secret";
const key = "sk_test_local-only-api-key";
const now = 1793962800;
function signed(timestamp = now, body = raw) {
  const signature = createHmac("sha512", secret).update(`${timestamp}.`).update(body).digest("hex");
  return `t=${timestamp},v1=whk_example:${signature}`;
}

test("Paystack modern signatures verify exact bytes and the signed timestamp", () => {
  assert.equal(verifyPaystackSignature(raw, signed(), secret, now), true);
  assert.equal(verifyPaystackSignature(Buffer.from(`${raw.toString()} `), signed(), secret, now), false);
  assert.equal(verifyPaystackSignature(raw, signed(now - 301), secret, now), false);
  assert.equal(verifyPaystackSignature(raw, signed(now + 301), secret, now), false);
  assert.equal(verifyPaystackSignature(raw, signed(now - 300), secret, now), true);
  assert.equal(verifyPaystackSignature(raw, signed(), "whsec_wrong", now), false);
});

test("Paystack signatures support key rotation and reject malformed or duplicate timestamps", () => {
  assert.equal(verifyPaystackSignature(raw, `${signed()},v1=whk_old:${"0".repeat(128)}`, secret, now), true);
  assert.equal(verifyPaystackSignature(raw, `v1=whk_old:${"0".repeat(128)},${signed()}`, secret, now), true);
  for (const header of [null, "", `${signed()},t=${now}`, signed().replace(`t=${now}`, "t=Infinity"), `t=${now},v1=whk_example:short`, "x".repeat(8193)]) {
    assert.equal(verifyPaystackSignature(raw, header, secret, now), false);
  }
});

test("Paystack configured modern signing cannot be downgraded to a legacy signature", () => {
  const legacy = createHmac("sha512", key).update(raw).digest("hex");
  const headers = new Headers({ "x-paystack-signature": legacy });
  assert.equal(verifyPaystackWebhook(raw, headers, key, undefined, now), true);
  assert.equal(verifyPaystackWebhook(raw, headers, key, secret, now), false);
  headers.set("paystack-signature", signed());
  assert.equal(verifyPaystackWebhook(raw, headers, key, secret, now), true);
  headers.set("paystack-signature", signed(now - 301));
  assert.equal(verifyPaystackWebhook(raw, headers, key, secret, now), false);
  assert.equal(verifyPaystackWebhook(raw, headers, "sk_live_never-allowed", secret, now), false);
});
