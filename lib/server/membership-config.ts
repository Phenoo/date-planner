import "server-only";
import { RequestError } from "@/lib/planner/http";

// This pilot is deliberately unavailable to the production Firebase project.
export function membershipTestEnabled() {
  const project = process.env.FIREBASE_PROJECT_ID;
  return process.env.DATE_ATLAS_BILLING_MODE === "test"
    && process.env.VERCEL_ENV !== "production"
    && !process.env.DATE_ATLAS_FUNCTIONS_URL
    && (project === "adal-preview-20261030" || project === "demo-date-atlas" && !!process.env.FIRESTORE_EMULATOR_HOST);
}

export function requireMembershipTest() {
  if (!membershipTestEnabled()) throw new RequestError("Membership testing isn't enabled here.", 503);
}

export function membershipCheckoutAvailability() {
  const enabled = membershipTestEnabled();
  return {
    paystack: enabled && !!process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") && !!process.env.PAYSTACK_PLUS_MONTHLY_PLAN,
    polar: enabled && !!process.env.POLAR_ACCESS_TOKEN && !!process.env.POLAR_PLUS_MONTHLY_PRODUCT,
  };
}

export function membershipTestUrl(path = "/membership") {
  const origin = new URL(process.env.DATE_ATLAS_BILLING_ORIGIN || (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3005"));
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.hostname === "adateatlas.com" || origin.hostname.endsWith(".adateatlas.com") || origin.hostname === "date-atlas.vercel.app"
    || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new RequestError("The test checkout return address isn't configured.", 503);
  return new URL(path, origin).href;
}
