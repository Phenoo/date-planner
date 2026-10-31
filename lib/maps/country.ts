import { z } from "zod";

const countrySchema = z.object({ code: z.string().regex(/^[A-Z]{2}$/), name: z.string().min(2).max(80) });
export const countryEstimateSchema = z.object({ country: countrySchema.nullable() });
export type EstimatedCountry = z.infer<typeof countrySchema>;

export function countryFromHeaders(headers: Pick<Headers, "get">, countries: readonly EstimatedCountry[]) {
  const code = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return countries.find((country) => country.code === code) ?? null;
}
