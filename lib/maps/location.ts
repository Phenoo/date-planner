import { z } from "zod";
import { coordinatesSchema, locationResponseSchema } from "./schema";
import type { NearbySearch } from "./schema";

export function discoveryQuery(request: Pick<NearbySearch, "city" | "country" | "area" | "locationScope">) {
  return request.locationScope === "city" ? `${request.city}, ${request.country}` : `${request.area}, ${request.city}, ${request.country}`;
}

export const geocodeResponseSchema = z.object({
  status: z.string(),
  results: z.array(z.object({
    address_components: z.array(z.object({ long_name: z.string(), short_name: z.string().optional(), types: z.array(z.string()) })),
    geometry: z.object({ location: coordinatesSchema }).optional(), types: z.array(z.string()).default([]),
  })).default([]),
});
export function locationFromGeocode(data: z.infer<typeof geocodeResponseSchema>) {
  if (data.status !== "OK") return null;
  const parts = data.results.flatMap((result) => result.address_components);
  const find = (...types: string[]) => {
    for (const type of types) {
      const part = parts.find((item) => item.types.includes(type));
      if (part) return part.long_name;
    }
    return "";
  };
  const city = find("locality", "postal_town", "administrative_area_level_1");
  const country = find("country");
  const area = find("neighborhood", "sublocality_level_1", "sublocality_level_2", "sublocality", "administrative_area_level_2") || city;
  const suggestedAreas = [...new Set(parts.filter((part) => part.types.some((type) => ["neighborhood", "sublocality_level_1", "sublocality_level_2"].includes(type))).map((part) => part.long_name))].filter((name) => name !== city).slice(0, 8);
  const result = locationResponseSchema.safeParse({ location: { city, area, country }, suggestedAreas });
  return result.success ? result.data : null;
}
