import { z } from "zod";
import { siteName, siteOrigin, supportEmail } from "@/lib/seo/site";
import { brandEmail } from "@/lib/email/brand-template";

export const accountEmailSchema = z.object({
  email: z.string().trim().email().max(254),
  intent: z.enum(["signIn", "resetPassword"]),
  returnPath: z.enum(["/", "/plan", "/saved", "/favorites", "/profile"]).default("/"),
  flow: z.uuid().optional(),
}).strict().refine(input => input.flow === undefined || input.intent === "signIn" && input.returnPath === "/plan", { path: ["flow"], message: "A planning flow is only available for planner sign-in." });

export function accountEmailReturnUrl(input: z.infer<typeof accountEmailSchema>) {
  const destination = new URL(input.returnPath, siteOrigin);
  if (input.intent === "signIn" && input.returnPath === "/plan" && input.flow) destination.searchParams.set("flow", input.flow);
  return destination.href;
}

export function accountEmailMessage(input: z.infer<typeof accountEmailSchema>, firebaseLink: string) {
  const generated = new URL(firebaseLink);
  const code = generated.searchParams.get("oobCode");
  if (!code || generated.searchParams.get("mode") !== input.intent) throw new Error("Invalid account action");
  const destination = new URL(accountEmailReturnUrl(input));
  if (input.intent === "signIn") destination.searchParams.set("auth", "email");
  const link = new URL("/auth/action", siteOrigin);
  link.search = new URLSearchParams({ mode: input.intent, oobCode: code, continueUrl: destination.href, lang: "en" }).toString();
  const action = input.intent === "signIn" ? `Sign in to ${siteName}` : `Reset your ${siteName} password`;
  const content = brandEmail({
    preheader: input.intent === "signIn" ? `Your secure sign-in link for ${siteName}.` : `Choose a new password for your ${siteName} account.`,
    eyebrow: input.intent === "signIn" ? "Your secure sign-in link" : "Account security",
    title: input.intent === "signIn" ? "Welcome back." : "Let’s get you back in.",
    paragraphs: [input.intent === "signIn" ? `Your saved dates are waiting. Use the button below to sign in securely to ${siteName}.` : `Use the button below to choose a new password for your ${siteName} account.`],
    primaryAction: {
      label: input.intent === "signIn" ? "Sign in securely" : "Reset my password",
      url: link.href,
      fallbackLabel: input.intent === "signIn" ? "Open your secure sign-in link" : "Open your password reset link",
    },
    note: "If you didn’t request this email, you can ignore it. Your account stays as it is. Don’t forward this personal link or share it with anyone.",
  });
  return {
    from: `${siteName} <noreply@adateatlas.com>`,
    to: [input.email],
    reply_to: supportEmail,
    subject: input.intent === "signIn" ? `Your ${siteName} sign-in link` : action,
    ...content,
  };
}
