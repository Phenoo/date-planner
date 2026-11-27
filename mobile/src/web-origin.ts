const site = "https://adateatlas.com";
const localHosts = new Set(["localhost", "127.0.0.1", "10.0.2.2", "[::1]"]);

export type Surface = { color: string; dark: boolean; chat: boolean };

export function readGoogleSignInReturn(value: string, sessionId: string) {
  const url = readUrl(value);
  if (!url || url.protocol !== "adateatlas:" || url.hostname !== "auth" || url.pathname !== "/google" || url.searchParams.get("session") !== sessionId) return null;
  const code = url.searchParams.get("code");
  return code && /^[a-f0-9]{64}$/.test(code) ? code : null;
}

export function readUrl(value: string) {
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

export function getWebOrigin(value: string | undefined, development: boolean) {
  const url = readUrl(value || site);
  if (url?.protocol === "https:") return url.origin;
  if (development && url?.protocol === "http:" && localHosts.has(url.hostname)) return url.origin;
  throw new Error("Set EXPO_PUBLIC_WEB_ORIGIN to an HTTPS website or a local development address.");
}

export function isCheckout(url: URL) {
  return url.protocol === "https:" && (url.hostname === "sandbox.polar.sh" || url.hostname === "paystack.com" || url.hostname.endsWith(".paystack.com"));
}

export function isGoogleSignIn(url: URL) {
  return url.protocol === "https:" && (url.hostname === "accounts.google.com"
    || (url.pathname === "/__/auth/handler" && url.searchParams.get("providerId") === "google.com"));
}

export function externalLink(url: URL) {
  // Google must use the authentication session so its result returns to the app.
  if (isGoogleSignIn(url)) return null;
  return ["https:", "tel:", "mailto:", "sms:", "geo:", "maps:", "comgooglemaps:", "whatsapp:"].includes(url.protocol) ? url.href : null;
}
