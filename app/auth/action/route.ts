import { siteOrigin } from "@/lib/seo/site";
import { z } from "zod";

const modes = new Set(["signIn", "resetPassword", "verifyEmail", "recoverEmail", "verifyAndChangeEmail", "revertSecondFactorAddition"]);
const returnPaths = new Set(["/", "/plan", "/saved", "/favorites", "/profile", "/login"]);
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

  let destination = new URL(mode === "signIn" ? "/saved" : "/login", siteOrigin);
  const continueUrl = input.get("continueUrl");
  if (continueUrl) {
    let requested: URL;
    try { requested = new URL(continueUrl); }
    catch { return new Response("This account link has an invalid destination.", { status: 400, headers }); }
    const allowedOrigins = new Set([siteOrigin, "https://date-atlas.vercel.app"]);
    if (!allowedOrigins.has(requested.origin) || requested.username || requested.password || !returnPaths.has(requested.pathname)) {
      return new Response("This account link has an invalid destination.", { status: 400, headers });
    }
    destination = new URL(mode === "signIn" && requested.pathname === "/login" ? "/saved" : requested.pathname, siteOrigin);
    const flow = requested.searchParams.get("flow");
    if (flow !== null) {
      if (mode !== "signIn" || requested.pathname !== "/plan" || !z.uuid().safeParse(flow).success) {
        return new Response("This account link has an invalid planning session.", { status: 400, headers });
      }
      destination.searchParams.set("flow", flow);
    }
  }

  const target = mode === "signIn" ? destination : new URL("/auth/manage", siteOrigin);
  target.searchParams.set("mode", mode);
  target.searchParams.set("oobCode", code);
  // The configured key takes precedence over any key included in an older email.
  if (mode === "signIn") {
    target.searchParams.set("apiKey", apiKey);
    target.searchParams.set("auth", "email");
  } else target.searchParams.set("continueUrl", destination.href);
  const language = input.get("lang");
  if (language && /^[a-zA-Z-]{2,35}$/.test(language)) target.searchParams.set("lang", language);

  return new Response(null, { status: 303, headers: { ...headers, Location: target.href } });
}
