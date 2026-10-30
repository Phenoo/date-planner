import { z } from "zod";
import { nearbyPlaceSchema } from "@/lib/maps/schema";
import { dateStorySchema } from "./date-story";
import { requestSchema } from "./schema";
import { savedRecipeSchema } from "./saved";

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
export const selectionIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const pendingInvitationKey = "date-atlas:pending-invitation:v1";
const pendingInvitationSchema = z.object({ sessionId: z.uuid(), placeId: z.string().min(1).max(200), action: z.enum(["create", "save"]).default("create"), expiresAt: z.number().finite() });
export function readPendingInvitation(raw: string | null, sessionId: string | undefined, placeId: string, now = Date.now()) {
  try {
    const parsed = pendingInvitationSchema.safeParse(JSON.parse(raw ?? "null"));
    return parsed.success && parsed.data.sessionId === sessionId && parsed.data.placeId === placeId && parsed.data.expiresAt > now && parsed.data.expiresAt <= now + 3600000 ? parsed.data.action : null;
  } catch { return null; }
}
export const invitationPlaceSchema = nearbyPlaceSchema.omit({ distanceKm: true, reason: true, story: true });
export const datePreferencesSchema = z.object({
  timeZone: requestSchema.shape.timeZone,
  date: z.union([z.literal(""), z.iso.date()]).default(""), duration: z.number().int().min(60).max(720).default(180),
  datePreference: z.enum(["weekday", "weekend"]),
  startTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  city: z.string().min(2).max(80), country: z.string().min(2).max(80),
});
export const invitationResponseSchema = z.enum(["pending", "accepted", "declined"]);
export const suggestedTimeSchema = z.object({ date: z.iso.date(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: requestSchema.shape.timeZone });
export const publicInvitationSchema = datePreferencesSchema.extend({
  source: z.enum(["google", "catalog"]).default("google"),
  place: invitationPlaceSchema.nullable(), placeId: z.string().min(1).max(200),
  story: dateStorySchema, response: invitationResponseSchema,
  dateStatus: z.enum(["planned", "completed"]), createdAt: z.iso.datetime(), suggestedTime: suggestedTimeSchema.optional(),
});
export const chosenDateSchema = publicInvitationSchema.extend({ id: selectionIdSchema, token: invitationTokenSchema, invitationRevoked: z.boolean().default(false), invitationPublished: z.boolean().default(true), title: z.string().max(100).optional(), canEdit: z.boolean().default(false) });
export const createdInvitationSchema = z.object({ id: selectionIdSchema, token: invitationTokenSchema, response: invitationResponseSchema.default("pending") });
export const dateHistoryResponseSchema = z.object({ dates: z.array(chosenDateSchema).max(10), nextCursor: selectionIdSchema.nullable() });
export type PublicInvitation = z.infer<typeof publicInvitationSchema>;
export type ChosenDate = z.infer<typeof chosenDateSchema>;
export const invitationInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("catalog"), recipe: savedRecipeSchema }),
  z.object({ action: z.literal("create"), sessionId: z.uuid(), placeId: z.string().min(1).max(200) }),
  z.object({ action: z.literal("save"), sessionId: z.uuid(), placeId: z.string().min(1).max(200) }),
  z.object({ action: z.literal("selection"), sessionId: z.uuid(), placeId: z.string().min(1).max(200) }),
  z.object({ action: z.literal("revoke"), id: selectionIdSchema }),
  z.object({ action: z.literal("read"), token: invitationTokenSchema }),
  z.object({ action: z.literal("reply"), token: invitationTokenSchema, response: z.enum(["accepted", "declined"]) }),
  z.object({ action: z.literal("suggest"), token: invitationTokenSchema, ...suggestedTimeSchema.shape }),
]);
export const historyInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), cursor: selectionIdSchema.optional(), status: z.enum(["planned", "completed"]).optional() }),
  z.object({ action: z.literal("complete"), id: selectionIdSchema }),
  z.object({ action: z.literal("rename"), id: selectionIdSchema, title: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("delete"), id: selectionIdSchema }),
  z.object({ action: z.literal("context"), id: selectionIdSchema }),
  z.object({ action: z.literal("update"), id: selectionIdSchema, request: requestSchema }),
  z.object({ action: z.literal("publish"), id: selectionIdSchema }),
]);

export function nextInvitationResponse(current: PublicInvitation["response"], requested: "accepted" | "declined") {
  if (current !== "pending" && current !== requested) return null;
  return requested;
}
