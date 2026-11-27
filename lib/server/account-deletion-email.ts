import "server-only";
import { z } from "zod";
import { brandEmail } from "@/lib/email/brand-template";
import { siteName, supportEmail } from "@/lib/seo/site";

export async function sendAccountDeletionEmail(recipient: string, requestId: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Account deletion confirmation delivery is not configured.");
  const to = z.email().max(254).parse(recipient);
  const content = brandEmail({
    preheader: "Your account deletion is complete.",
    eyebrow: "PRIVACY & YOUR DATA",
    title: "Your account has been deleted.",
    paragraphs: ["Your A Date At las account, private plans, saved dates, feedback and invitation records have been removed.", "Your public invitation links are no longer available. This confirmation does not create a new account."],
    note: "A minimal completion receipt is retained for 30 days. This email provider may retain its delivery record under its own retention policy.",
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `account-deleted/${requestId}` },
    body: JSON.stringify({ from: `${siteName} <noreply@adateatlas.com>`, to: [to], reply_to: supportEmail, subject: `Your account has been deleted | ${siteName}`, ...content }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Account deletion confirmation will be retried.");
}
