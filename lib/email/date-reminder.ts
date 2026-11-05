import { siteName, siteOrigin } from "@/lib/seo/site";
import { brandEmail } from "./brand-template";

export function dateReminderEmail(input: { venueName: string; address?: string; city?: string; scheduleLabel: string }) {
  return { subject: `A little reminder for your date | ${siteName}`, ...brandEmail({
    preheader: `Your date at ${input.venueName} is coming up. Your saved details are ready.`,
    eyebrow: "A little reminder",
    title: "Something to look forward to.",
    paragraphs: ["Your date is coming up. Open My dates to check the details and make a little room for time together."],
    facts: [
      { label: "When", value: input.scheduleLabel },
      { label: "Where", value: [input.venueName, input.address || input.city].filter(Boolean).join("\n") },
    ],
    primaryAction: { label: "Open my date", url: `${siteOrigin}/saved` },
    note: "Venue details from Google Maps.\n\nThis is a reminder for your saved plan, not a booking confirmation. Confirm current opening hours, prices and any reservation directly with the venue.",
  }) };
}
