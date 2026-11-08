import { z } from "zod";

const attemptSchema = z.object({ owner: z.string(), fingerprint: z.string(), key: z.uuid(), expiresAt: z.number() });
export const replacementReferenceSchema = z.object({ owner: z.string(), kind: z.enum(["plan", "discovery"]), id: z.string(), expiresAt: z.number() });
export const replacementReferenceKey = (flow: string) => `date-atlas:replacement:v1:${flow}`;
const generationAttemptKey = (flow: string) => `date-atlas:generation-attempt:v1:${flow}`;

export function hasRetainedGenerationAttempt(storage: Pick<Storage, "getItem">, owner: string, flow: string, now = Date.now()) {
  try {
    const previous = attemptSchema.safeParse(JSON.parse(storage.getItem(generationAttemptKey(flow)) ?? "null"));
    return previous.success && previous.data.owner === owner && previous.data.expiresAt > now && previous.data.expiresAt <= now + 3600000;
  } catch { return false; }
}

// Persist only a digest and request ID; the payload can contain personal notes.
export async function retainedGenerationKey(storage: Pick<Storage, "getItem" | "setItem">, owner: string, flow: string, body: string, now = Date.now()) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const fingerprint = Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
  const storageKey = generationAttemptKey(flow);
  try {
    const previous = attemptSchema.safeParse(JSON.parse(storage.getItem(storageKey) ?? "null"));
    if (previous.success && previous.data.owner === owner && previous.data.fingerprint === fingerprint && previous.data.expiresAt > now && previous.data.expiresAt <= now + 3600000) return previous.data.key;
  } catch { /* A blocked browser store still permits an in-memory retry. */ }
  const key = crypto.randomUUID();
  try { storage.setItem(storageKey, JSON.stringify({ owner, fingerprint, key, expiresAt: now + 3600000 })); } catch { /* The caller keeps the key for retries in this page. */ }
  return key;
}
