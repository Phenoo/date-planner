import { siteName, siteOrigin } from "@/lib/seo/site";
import { brandEmail } from "./brand-template";

export type DateCreatedEmailInput = {
  venueName: string;
  address?: string;
  scheduleLabel: string;
  city?: string;
  dateTitle?: string;
  invitationUrl?: string;
  googleAttribution?: boolean;
};

function publicInvitationUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== siteOrigin || url.username || url.password || !/^\/invite\/[A-Za-z0-9_-]{32}$/.test(url.pathname) || url.search || url.hash) throw new Error("Invalid public invitation URL.");
  return url.href;
}

export function dateCreatedEmail(input: DateCreatedEmailInput) {
  const invitationUrl = input.invitationUrl === undefined ? undefined : publicInvitationUrl(input.invitationUrl);
  const content = brandEmail({
    preheader: `Your date at ${input.venueName} is saved. The details are ready when you are.`,
    eyebrow: "Your date, saved",
    title: "It feels like a date.",
    paragraphs: ["Your chosen place and date details are saved in My dates. Open them whenever you’re ready to take the next step."],
    facts: [
      ...(input.dateTitle ? [{ label: "Your date", value: input.dateTitle }] : []),
      { label: "When", value: input.scheduleLabel },
      { label: "Where", value: [input.venueName, input.address || input.city].filter(Boolean).join("\n") },
    ],
    primaryAction: { label: "Open my date", url: `${siteOrigin}/saved` },
    ...(invitationUrl ? { secondaryAction: { label: "Open your shareable invitation", url: invitationUrl } } : {}),
    note: `${input.googleAttribution ? "Venue details from Google Maps.\n\n" : ""}This is your saved plan, not a booking confirmation. Check current opening hours, prices and any reservation directly with the venue. Changes made later will appear in My dates.`,
  });
  return { subject: `Your date is saved | ${siteName}`, ...content };
}
