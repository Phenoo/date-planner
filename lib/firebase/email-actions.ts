import { z } from "zod";
import { siteName, siteOrigin, supportEmail } from "@/lib/seo/site";

export const accountEmailSchema = z.object({
  email: z.string().trim().email().max(254),
  intent: z.enum(["signIn", "resetPassword"]),
  returnPath: z.enum(["/", "/plan", "/saved", "/favorites", "/profile"]).default("/"),
}).strict();

export function accountEmailMessage(input: z.infer<typeof accountEmailSchema>, firebaseLink: string) {
  const generated = new URL(firebaseLink);
  const code = generated.searchParams.get("oobCode");
  if (!code || generated.searchParams.get("mode") !== input.intent) throw new Error("Invalid account action");
  const destination = new URL(input.returnPath, siteOrigin);
  if (input.intent === "signIn") destination.searchParams.set("auth", "email");
  const link = new URL("/auth/action", siteOrigin);
  link.search = new URLSearchParams({ mode: input.intent, oobCode: code, continueUrl: destination.href, lang: "en" }).toString();
  const action = input.intent === "signIn" ? `Sign in to ${siteName}` : `Reset your ${siteName} password`;
  return {
    from: `${siteName} <noreply@adateatlas.com>`,
    to: [input.email],
    reply_to: supportEmail,
    subject: input.intent === "signIn" ? `Your ${siteName} sign-in link` : action,
    text: `${action}\n\nUse this secure link to continue:\n${link.href}\n\nIf you didn't request this email, you can ignore it.\n\n${siteName}\n${supportEmail}`,
    html: `<p>${action}</p><p><a href="${link.href.replaceAll("&", "&amp;")}">${action}</a></p><p>If you didn't request this email, you can ignore it.</p><p>${siteName}<br>${supportEmail}</p>`,
  };
}
