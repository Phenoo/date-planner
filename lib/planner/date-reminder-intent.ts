import { z } from "zod";

export const pendingDateReminderKey = "date-atlas:pending-date-reminder:v1";
const intentSchema = z.object({
  sessionId: z.uuid(),
  placeId: z.string().min(1).max(200),
  recipientKey: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().finite(),
});

export async function reminderRecipientKey(email: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function readDateReminderIntent(raw: string | null, sessionId: string | undefined, placeId: string, now = Date.now()) {
  try {
    const parsed = intentSchema.safeParse(JSON.parse(raw ?? "null"));
    return parsed.success && parsed.data.sessionId === sessionId && parsed.data.placeId === placeId && parsed.data.expiresAt > now && parsed.data.expiresAt <= now + 3600000 ? parsed.data : null;
  } catch { return null; }
}
