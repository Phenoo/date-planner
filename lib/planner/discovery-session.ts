import { z } from "zod";
import { requestSchema } from "./schema";
import { recommendationResultSchema } from "./response-schema";

export const activeDiscoveryKey = "date-atlas:active-discovery:v1";
export const invitationReturnKey = "date-atlas:invitation-return:v1";
export const discoverySessionSchema = z.object({ flow: z.string().max(100), request: requestSchema, result: recommendationResultSchema, expiresAt: z.number(), accepted: z.boolean().default(false) });
export function restoreDiscoverySession(raw: string | null, flow: string, now = Date.now()) {
  try {
    const parsed = discoverySessionSchema.safeParse(JSON.parse(raw ?? "null"));
    if (!parsed.success || parsed.data.flow !== flow || parsed.data.expiresAt < now || !parsed.data.result.nearby?.places.length) return null;
    return parsed.data;
  } catch { return null; }
}
