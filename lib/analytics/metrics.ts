import { z } from "zod";

export const metricPaths = ["/", "/date-ideas", "/plan", "/explore", "/saved", "/profile", "/favorites", "/privacy", "/terms", "/invite", "/experiences"] as const;
export const webVitalSchema = z.object({ name: z.enum(["LCP", "INP", "CLS"]), value: z.number().finite().nonnegative().max(86400000), device: z.enum(["mobile", "desktop"]), path: z.enum(metricPaths), id: z.string().min(1).max(120).regex(/^[\w.-]+$/) }).strict().superRefine((value, context) => { if (value.name === "CLS" && value.value > 100) context.addIssue({ code: "custom", message: "Invalid layout-shift measurement." }); });
export type WebVital = z.infer<typeof webVitalSchema>;
export function summarizeWebVitals(samples: Pick<WebVital, "name" | "value" | "device">[]) {
  return (["mobile", "desktop"] as const).flatMap((device) => (["LCP", "INP", "CLS"] as const).map((name) => {
    const values = samples.filter((sample) => sample.device === device && sample.name === name).map((sample) => sample.value).sort((a, b) => a - b);
    const p75 = values.length ? values[Math.ceil(values.length * .75) - 1] : null;
    const [good, poor] = name === "LCP" ? [2500, 4000] : name === "INP" ? [200, 500] : [.1, .25];
    return { device, name, count: values.length, p75, rating: p75 === null ? "no-data" as const : p75 <= good ? "good" as const : p75 <= poor ? "needs-improvement" as const : "poor" as const };
  }));
}
export type JourneyEvent = { event: string; journey: string; createdAt: number; step?: string };
export function summarizeJourneys(events: JourneyEvent[], now = Date.now()) {
  const journeys = new Map<string, JourneyEvent[]>();
  for (const event of events) journeys.set(event.journey, [...(journeys.get(event.journey) ?? []), event]);
  const started = [...journeys.values()].filter((group) => group.some((entry) => entry.event === "planner_started"));
  const stages = ["planner_started", "planner_completed", "recommendation_succeeded", "recommendation_accepted", "plan_saved", "invitation_created"];
  const funnel = stages.map((event) => ({ event, count: started.filter((group) => group.some((entry) => entry.event === event)).length }));
  const completed = funnel.find((stage) => stage.event === "planner_completed")?.count ?? 0;
  const dropoffs = new Map<string, number>(); let pending = 0;
  for (const group of started) {
    if (group.some((entry) => entry.event === "planner_completed")) continue;
    const latest = [...group].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest.createdAt > now - 30 * 60000) { pending++; continue; }
    const step = [...group].filter((entry) => entry.event === "planner_step_viewed" && entry.step).sort((a, b) => b.createdAt - a.createdAt)[0]?.step ?? "not-recorded";
    dropoffs.set(step, (dropoffs.get(step) ?? 0) + 1);
  }
  return { started: started.length, completed, completionRate: started.length ? completed / started.length : null, pending, funnel, dropoffs: [...dropoffs].map(([step, count]) => ({ step, count })) };
}

export const metricsResponseSchema = z.object({
  retentionDays: z.literal(30), sampled: z.boolean(),
  journeys: z.object({ started: z.number(), completed: z.number(), completionRate: z.number().nullable(), pending: z.number(), funnel: z.array(z.object({ event: z.string(), count: z.number() })), dropoffs: z.array(z.object({ step: z.string(), count: z.number() })) }),
  vitals: z.array(z.object({ device: z.enum(["mobile", "desktop"]), name: z.enum(["LCP", "INP", "CLS"]), count: z.number(), p75: z.number().nullable(), rating: z.enum(["no-data", "good", "needs-improvement", "poor"]) })),
});
