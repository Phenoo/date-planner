import { z } from "zod";
export const funnelEvents = ["planner_started", "planner_completed", "recommendation_succeeded", "recommendation_failed", "recommendation_accepted", "recommendation_rejected", "authentication_completed", "plan_saved", "invitation_created", "invitation_opened"] as const;
export type FunnelEvent = typeof funnelEvents[number];
export const clientEventSchema = z.object({ event: z.enum(["planner_started", "recommendation_accepted", "recommendation_rejected", "authentication_completed"]), scope: z.uuid(), reason: z.enum(["place", "distance", "activity"]).optional() }).strict();
