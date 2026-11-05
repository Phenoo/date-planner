import { createHash } from "node:crypto";
import { z } from "zod";
import { siteName, siteOrigin, supportEmail } from "@/lib/seo/site";

const singleLine = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const optionalWebsite = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !/[\u0000-\u0020\u007f]/.test(value);
  } catch { return false; }
}).optional();

export const partnershipEnquirySchema = z.object({
  contactName: singleLine(2, 120),
  workEmail: z.string().trim().email().max(254),
  organization: singleLine(2, 160),
  role: singleLine(0, 120).optional(),
  partnershipType: z.enum(["venue", "experience", "brand", "other"]),
  cityCountry: singleLine(2, 160),
  website: optionalWebsite,
  proposal: z.string().trim().min(80).max(5000).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  privacyAcknowledgement: z.literal(true),
  honeypot: z.string().max(200),
}).strict();

export type PartnershipEnquiry = z.infer<typeof partnershipEnquirySchema>;
export const partnershipSubmissionIdSchema = z.string().uuid();

const partnershipLabels = {
  venue: "Venue partnership",
  experience: "Experience partnership",
  brand: "Brand partnership",
  other: "Other partnership",
} satisfies Record<PartnershipEnquiry["partnershipType"], string>;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function partnershipEnquiryMessage(input: PartnershipEnquiry) {
  const fields = [
    ["Contact", input.contactName],
    ["Work email", input.workEmail],
    ["Organization", input.organization],
    ["Role", input.role || "Not provided"],
    ["Partnership type", partnershipLabels[input.partnershipType]],
    ["City and country", input.cityCountry],
    ["Website", input.website || "Not provided"],
  ];
  const subject = `${siteName} — ${partnershipLabels[input.partnershipType]} enquiry`;
  return {
    from: `${siteName} <noreply@adateatlas.com>`,
    to: [supportEmail],
    reply_to: input.workEmail,
    subject,
    text: `${subject}\n\n${fields.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nProposal:\n${input.proposal}\n\nPrivacy notice acknowledged: Yes\nSubmitted through ${siteOrigin}/partners`,
    html: `<h1>${escapeHtml(subject)}</h1><dl>${fields.map(([label, value]) => `<dt><strong>${escapeHtml(label)}</strong></dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl><h2>Proposal</h2><p>${escapeHtml(input.proposal).replaceAll("\n", "<br>")}</p><p>Privacy notice acknowledged: Yes</p><p>Submitted through ${escapeHtml(siteOrigin)}/partners</p>`,
  };
}

export function partnershipIdempotencyKey(input: PartnershipEnquiry, submissionId: string) {
  const digest = createHash("sha256").update(JSON.stringify(partnershipEnquiryMessage(input))).digest("hex");
  return `partnership/${submissionId.toLowerCase()}/${digest}`;
}
