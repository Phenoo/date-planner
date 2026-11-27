import { z } from "zod";

export const membershipProviderSchema = z.enum(["paystack", "polar"]);
export type MembershipProvider = z.infer<typeof membershipProviderSchema>;
export const membershipLimits = {
  free: { plans: 1, changes: 0 },
  plus: { plans: null, changes: null },
} as const;

export const membershipRecordSchema = z.object({
  provider: membershipProviderSchema,
  subscriptionId: z.string().min(1).max(200),
  customerId: z.string().min(1).max(200),
  status: z.enum(["active", "past_due", "canceled", "revoked"]),
  paidPeriodStart: z.number().int().nonnegative(),
  paidPeriodEnd: z.number().int().positive(),
  cancelAtPeriodEnd: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
  providerCheckedAt: z.number().int().nonnegative().optional(),
});
export type MembershipRecord = z.infer<typeof membershipRecordSchema>;

export function membershipPeriod(record: MembershipRecord | null, now = Date.now()) {
  const paid = record && record.status !== "revoked" && record.paidPeriodStart <= now && record.paidPeriodEnd > now;
  const date = new Date(now);
  const periodStart = paid ? record.paidPeriodStart : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const periodEnd = paid ? record.paidPeriodEnd : Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    tier: paid ? "plus" as const : "free" as const,
    periodStart,
    periodEnd,
    status: paid ? record.cancelAtPeriodEnd || record.status === "canceled" ? "canceling" as const : "active" as const
      : record?.status === "past_due" ? "past_due" as const : record ? "expired" as const : "free" as const,
    provider: record?.provider ?? null,
  };
}

const allowanceSchema = z.object({ limit: z.number().int().nonnegative().nullable(), used: z.number().int().nonnegative(), remaining: z.number().int().nonnegative().nullable() });
export const membershipSummarySchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["off", "test"]),
  signedIn: z.boolean(),
  tier: z.enum(["free", "plus"]),
  status: z.enum(["free", "active", "canceling", "past_due", "expired"]),
  provider: membershipProviderSchema.nullable(),
  periodStart: z.number(),
  periodEnd: z.number(),
  plans: allowanceSchema,
  changes: allowanceSchema,
  checkout: z.object({ paystack: z.boolean(), polar: z.boolean() }),
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
