import { siteOrigin } from "@/lib/seo/site";

const modes = new Set(["signIn", "resetPassword", "verifyEmail", "recoverEmail", "verifyAndChangeEmail", "revertSecondFactorAddition"]);
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function GET(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId || !/^[a-z0-9-]+$/.test(projectId)) {
    return new Response("Account services are unavailable. Please try again later.", { status: 503, headers });
  }

  const input = new URL(request.url).searchParams;
  const mode = input.get("mode");
  const code = input.get("oobCode");
  if (!mode || !modes.has(mode) || !code || code.length > 2048) {
    return new Response("This account link is incomplete. Please request a new email.", { status: 400, headers });
  }

  // Firebase's generated emails can select a different browser key from this project's Maps keys.
  const target = new URL(`https://${projectId}.firebaseapp.com/__/auth/action`);
  target.searchParams.set("apiKey", apiKey);
  target.searchParams.set("mode", mode);
  target.searchParams.set("oobCode", code);

  const continueUrl = input.get("continueUrl");
  if (continueUrl) {
    let destination: URL;
    try { destination = new URL(continueUrl); }
    catch { return new Response("This account link has an invalid destination.", { status: 400, headers }); }
    const allowedOrigins = new Set([siteOrigin, "https://date-atlas.vercel.app"]);
    if (!allowedOrigins.has(destination.origin) || destination.username || destination.password || destination.pathname === "/auth/action") {
      return new Response("This account link has an invalid destination.", { status: 400, headers });
    }
    target.searchParams.set("continueUrl", destination.href);
  }
  const language = input.get("lang");
  if (language && /^[a-zA-Z-]{2,35}$/.test(language)) target.searchParams.set("lang", language);

  return new Response(null, { status: 303, headers: { ...headers, Location: target.href } });
}
