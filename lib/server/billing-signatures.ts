import { createHmac, timingSafeEqual } from "node:crypto";

function equalSignature(expected: Buffer, supplied: string) {
  return /^[a-f0-9]{128}$/.test(supplied) && timingSafeEqual(expected, Buffer.from(supplied, "hex"));
}

export function verifyPaystackSignature(rawBody: Uint8Array, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || header.length > 8192 || !secret.startsWith("whsec_")) return false;
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const entry of header.split(",")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (name === "t") {
      if (timestamp !== undefined || !/^\d+$/.test(value)) return false;
      timestamp = Number(value);
    } else if (name === "v1") {
      const keySeparator = value.indexOf(":");
      if (keySeparator > 0 && /^whk_[A-Za-z0-9]+$/.test(value.slice(0, keySeparator))) signatures.push(value.slice(keySeparator + 1));
    }
  }
  if (timestamp === undefined || !Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = createHmac("sha512", secret).update(`${timestamp}.`).update(rawBody).digest();
  return signatures.some((signature) => equalSignature(expected, signature));
}

export function verifyPaystackWebhook(rawBody: Uint8Array, headers: Headers, secretKey: string, webhookSecret?: string, nowSeconds?: number) {
  if (!secretKey.startsWith("sk_test_")) return false;
  // Once a signing secret is configured, accepting the legacy header would allow timestamp checks to be bypassed.
  if (webhookSecret) return verifyPaystackSignature(rawBody, headers.get("paystack-signature"), webhookSecret, nowSeconds);
  const supplied = headers.get("x-paystack-signature");
  if (!supplied) return false;
  return equalSignature(createHmac("sha512", secretKey).update(rawBody).digest(), supplied);
}
