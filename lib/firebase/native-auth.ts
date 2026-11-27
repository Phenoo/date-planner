import { z } from "zod";

export const nativeAuthSecretSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const nativeAuthLifetimeMs = 5 * 60 * 1000;
export const nativeAuthReturnUrl = "adateatlas://auth/google";
export const nativeAuthRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), challenge: nativeAuthSecretSchema }).strict(),
  z.object({ action: z.literal("complete"), sessionId: nativeAuthSecretSchema }).strict(),
  z.object({ action: z.literal("exchange"), sessionId: nativeAuthSecretSchema, verifier: nativeAuthSecretSchema, code: nativeAuthSecretSchema }).strict(),
]);

export const nativeAuthStartSchema = z.object({ sessionId: nativeAuthSecretSchema });
export const nativeAuthCompleteSchema = z.object({ code: nativeAuthSecretSchema });
export const nativeAuthTokenSchema = z.object({ customToken: z.string().min(1).max(10000) });
