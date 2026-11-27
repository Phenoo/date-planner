import { z } from "zod";
import { citySearchSchema } from "@/lib/maps/cities";
import { nearbyPlaceSchema } from "@/lib/maps/schema";
import { invitationTokenSchema } from "./invitations";

export const wishlistLimit = 12;
export const wishlistPlaceIdSchema = nearbyPlaceSchema.shape.id;
export const selectedWishlistPlaceSchema = z.object({ id: wishlistPlaceIdSchema, name: z.string().min(1).max(200) });
export const wishlistPlaceSchema = nearbyPlaceSchema.pick({ id: true, name: true, address: true, category: true, mapsUrl: true, attributions: true });
export const wishlistEntrySchema = citySearchSchema.extend({ placeId: wishlistPlaceIdSchema });
export const wishlistResponseSchema = z.object({
  exists: z.boolean(),
  shareToken: invitationTokenSchema.nullable().optional(),
  entries: z.array(wishlistEntrySchema.extend({ place: wishlistPlaceSchema.nullable() })).max(wishlistLimit),
});

const access = { token: invitationTokenSchema.optional() };
export const wishlistInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), ...access }),
  z.object({ action: z.literal("create") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("disable"), token: invitationTokenSchema }),
  citySearchSchema.extend({ action: z.literal("search"), ...access, query: z.string().trim().min(2).max(100) }),
  wishlistEntrySchema.extend({ action: z.literal("add"), ...access }),
  z.object({ action: z.literal("remove"), ...access, placeId: wishlistPlaceIdSchema }),
]);

export type WishlistEntry = z.infer<typeof wishlistResponseSchema>["entries"][number];
