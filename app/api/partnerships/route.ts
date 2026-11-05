import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { siteOrigin } from "@/lib/seo/site";
import { partnershipEnquiryMessage, partnershipEnquirySchema, partnershipIdempotencyKey, partnershipSubmissionIdSchema } from "@/lib/server/partnership-enquiry";

function trustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === siteOrigin || origin === "https://date-atlas.vercel.app") return true;
  if (process.env.NODE_ENV === "production" || !origin) return false;
  const url = new URL(request.url);
  return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && origin === url.origin;
}

const fieldErrors: Record<string, string> = {
  contactName: "Please enter your name (2–120 characters).",
  workEmail: "Please enter a valid work email address.",
  organization: "Please enter your organization (2–160 characters).",
  role: "Please keep your role to 120 characters on one line.",
  partnershipType: "Please select a partnership type.",
  cityCountry: "Please enter your city and country (2–160 characters).",
  website: "Please enter a complete http or https website address, or leave it blank.",
  proposal: "Please describe your proposal in 80–5,000 characters.",
  privacyAcknowledgement: "Please acknowledge the privacy notice before sending your enquiry.",
};

function accepted() {
  return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (!trustedOrigin(request)) throw new RequestError("Please send your enquiry from A Date At las.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestError("Please send a valid JSON request.", 400);
    const parsed = partnershipEnquirySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new RequestError(typeof field === "string" && Object.hasOwn(fieldErrors, field) ? fieldErrors[field] : "Please check the form and complete all required fields.", 400);
    }
    const submissionId = partnershipSubmissionIdSchema.safeParse(request.headers.get("Idempotency-Key"));
    if (!submissionId.success) throw new RequestError("Please refresh the page before sending your enquiry again.", 400);
    if (parsed.data.honeypot) return accepted();
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new RequestError("Enquiries are temporarily unavailable. Please try again shortly.", 503);
    await enforcePlannerLimit(request, "partnership");
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": partnershipIdempotencyKey(parsed.data, submissionId.data) },
        body: JSON.stringify(partnershipEnquiryMessage(parsed.data)),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
      });
    } catch {
      throw new RequestError("We couldn't confirm your enquiry was sent. Please try again shortly.", 503);
    }
    await response.body?.cancel();
    if (!response.ok) throw new RequestError(response.status === 429 ? "Enquiries are busy right now. Please wait a minute and try again." : "We couldn't confirm your enquiry was sent. Please try again shortly.", response.status === 429 ? 429 : 503);
    return accepted();
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
