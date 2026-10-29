import { z } from "zod";
import { nearbyPlaceSchema } from "@/lib/maps/schema";
import { dateStorySchema } from "./date-story";

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
export const selectionIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const invitationPlaceSchema = nearbyPlaceSchema.omit({ distanceKm: true, reason: true, story: true });
export const datePreferencesSchema = z.object({
  date: z.union([z.literal(""), z.iso.date()]).default(""), duration: z.number().int().min(60).max(720).default(180),
  datePreference: z.enum(["weekday", "weekend"]),
  startTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  city: z.string().min(2).max(80), country: z.string().min(2).max(80),
});
export const invitationResponseSchema = z.enum(["pending", "accepted", "declined"]);
export const publicInvitationSchema = datePreferencesSchema.extend({
  place: invitationPlaceSchema.nullable(), placeId: z.string().min(1).max(200),
  story: dateStorySchema, response: invitationResponseSchema,
  dateStatus: z.enum(["planned", "completed"]), createdAt: z.iso.datetime(),
});
export const chosenDateSchema = publicInvitationSchema.extend({ id: selectionIdSchema, token: invitationTokenSchema });
export const createdInvitationSchema = z.object({ id: selectionIdSchema, token: invitationTokenSchema, response: invitationResponseSchema.default("pending") });
export const dateHistoryResponseSchema = z.object({ dates: z.array(chosenDateSchema).max(10), nextCursor: selectionIdSchema.nullable() });
export type PublicInvitation = z.infer<typeof publicInvitationSchema>;
export type ChosenDate = z.infer<typeof chosenDateSchema>;
export const invitationInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), sessionId: z.uuid(), placeId: z.string().min(1).max(200) }),
  z.object({ action: z.literal("read"), token: invitationTokenSchema }),
  z.object({ action: z.literal("reply"), token: invitationTokenSchema, response: z.enum(["accepted", "declined"]) }),
]);
export const historyInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), cursor: selectionIdSchema.optional(), status: z.enum(["planned", "completed"]).optional() }),
  z.object({ action: z.literal("complete"), id: selectionIdSchema }),
]);

export function nextInvitationResponse(current: PublicInvitation["response"], requested: "accepted" | "declined") {
  if (current !== "pending" && current !== requested) return null;
  return requested;
}
