import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { membershipPeriod, membershipRecordSchema } from "@/lib/membership/schema";
import { recurringDateSettingsSchema } from "@/lib/membership/recurring-date-night";
import { requestSchema } from "@/lib/planner/schema";
import { selectedWishlistPlaceSchema } from "@/lib/planner/shared-wishlist";

export const recurringDateCollection = "recurringDateNights";
export function recurringDateEmailId(date: string) {
  return createHash("sha256").update(`recurring-date-night:${date}`).digest("hex");
}
export const recurringDateRecordSchema = recurringDateSettingsSchema.extend({
  timeZone: requestSchema.shape.timeZone,
  nextDate: z.iso.date(),
  startsAt: z.number().int(),
  dueAt: z.number().int().nullable(),
  latest: z.object({
    deliveryId: z.uuid(),
    date: z.iso.date(),
    startsAt: z.number().int(),
    place: selectedWishlistPlaceSchema.pick({ id: true }).extend({ distanceKm: z.number().nonnegative() }).nullable(),
  }).nullable(),
});
export type RecurringDateRecord = z.infer<typeof recurringDateRecordSchema>;

export function recurringDateEntitled(data: unknown, now = Date.now()) {
  const membership = membershipRecordSchema.safeParse(data);
  return membership.success && membershipPeriod(membership.data, now).tier === "plus";
}
