import { z } from "zod";
import { citySearchSchema } from "./cities";
import { nearbyPlaceSchema, nearbyResultSchema } from "./schema";
import { hasQualifyingGoogleRating } from "./recommendation-quality";

export const cityDiscoverySearchSchema = citySearchSchema.extend({
  excludeIds: z.array(z.string().trim().min(1).max(200)).max(60).default([]),
}).strict();

export const cityDiscoveryResultSchema = nearbyResultSchema.pick({ city: true, country: true, area: true, warnings: true, searchIssues: true }).extend({
  places: z.array(nearbyPlaceSchema.refine((place) => hasQualifyingGoogleRating(place.details?.rating), "A confirmed Google rating above 3.75 is required.")).max(12),
});

export type CityDiscoverySearch = z.infer<typeof cityDiscoverySearchSchema>;
export type CityDiscoveryResult = z.infer<typeof cityDiscoveryResultSchema>;
