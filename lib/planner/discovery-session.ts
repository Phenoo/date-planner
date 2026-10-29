import { z } from "zod";
import { requestSchema } from "./schema";
import { recommendationResultSchema } from "./response-schema";

export const activeDiscoveryKey = "date-atlas:active-discovery:v1";
export const invitationReturnKey = "date-atlas:invitation-return:v1";
export const rejectedPicksKey = (flow: string) => `date-atlas:rejected-picks:v2:${flow}`;
const rejectedPicksSchema = z.object({ excludeIds: z.array(z.string().min(1).max(100)).default([]), excludePlaceIds: z.array(z.string().min(1).max(200)).default([]) });
export function mergeRejectedPicks(...values: unknown[]) {
  const valid = values.flatMap((value) => { const parsed = rejectedPicksSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  return { excludeIds: [...new Set(valid.flatMap((value) => value.excludeIds))].slice(-30), excludePlaceIds: [...new Set(valid.flatMap((value) => value.excludePlaceIds))].slice(-60) };
}
export function readRejectedPicks(raw: string | null) {
  try { return mergeRejectedPicks(JSON.parse(raw ?? "null")); } catch { return mergeRejectedPicks(); }
}
export const discoverySessionSchema = z.object({ flow: z.string().max(100), request: requestSchema, result: recommendationResultSchema, expiresAt: z.number(), accepted: z.boolean().default(false) });
export function restoreDiscoverySession(raw: string | null, flow: string, now = Date.now()) {
  try {
    const parsed = discoverySessionSchema.safeParse(JSON.parse(raw ?? "null"));
    if (!parsed.success || parsed.data.flow !== flow || parsed.data.expiresAt < now || !parsed.data.result.nearby?.places.length) return null;
    return parsed.data;
  } catch { return null; }
}
