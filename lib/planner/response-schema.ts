import { z } from "zod";
import { experienceSchema, requestSchema } from "./schema";
import { nearbyResultSchema } from "@/lib/maps/schema";
const scores = z.object({ interests: z.number(), budget: z.number(), location: z.number(), occasion: z.number(), reliability: z.number() });
export const datePlanSchema = z.object({ id: z.string(), type: z.enum(["Smart & affordable", "Best overall match", "Something special"]), title: z.string(), introduction: z.string(), score: z.number(), scores,
  activities: z.array(z.object({ experience: experienceSchema, start: z.number(), end: z.number(), cost: z.number(), travelMinutes: z.number(), distance: z.number(), reason: z.string() })).min(1).max(4),
  activityCost: z.number(), transportCost: z.number(), contingencyCost: z.number(), total: z.number(), remaining: z.number().nullable(), budget: z.number().nullable(), duration: z.number(), totalDistance: z.number(), returnTravel: z.number(), request: requestSchema, demo: z.boolean(), tips: z.array(z.string()),
});
export const recommendationResultSchema = z.object({ nearby: nearbyResultSchema.optional(), plans: z.array(datePlanSchema).max(3), warnings: z.array(z.string()), diagnostics: z.array(z.object({id:z.string(),name:z.string(),eligible:z.boolean(),reasons:z.array(z.string()),score:z.number().optional()})), source:z.enum(["demo","firebase"]),ai:z.boolean() });
