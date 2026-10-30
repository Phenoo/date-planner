import { z } from "zod";
export const placeIdSchema = z.string().trim().min(1).max(200).regex(/^[^\s/]+$/);
export const venueControlSchema = z.object({ placeId: placeIdSchema, disabled: z.boolean(), note: z.string().trim().min(3).max(500), sourceUrl: z.url({ protocol: /^https$/ }), verifiedAt: z.iso.date() });
export const reportReasonSchema = z.enum(["price", "hours", "access", "closed", "other"]);
export const venueReportSchema = z.object({ placeId: placeIdSchema, sessionId: z.uuid().optional(), reason: reportReasonSchema });
export const venueAdminInputSchema = z.discriminatedUnion("action", [
  venueControlSchema.extend({ action: z.literal("control") }),
  z.object({ action: z.literal("resolve"), id: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
export const venueAdminResponseSchema = z.object({ controls: z.array(venueControlSchema), reports: z.array(z.object({ id: z.string(), placeId: placeIdSchema, reason: reportReasonSchema, createdAt: z.string() })) });
