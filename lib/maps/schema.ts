import { z } from "zod";
import { vibes } from "@/lib/planner/schema";
import { dateStorySchema } from "@/lib/planner/date-story";

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;
export const locationResponseSchema = z.object({
  location: z.object({ city: z.string().min(2).max(80), area: z.string().min(2).max(80), country: z.string().min(2).max(80) }),
  suggestedAreas: z.array(z.string().max(80)).max(8),
});
export type DetectedLocation = z.infer<typeof locationResponseSchema>;
export const nearbySearchSchema = z.object({
  city: z.string().trim().min(2).max(80), area: z.string().trim().min(2).max(80), country: z.string().trim().min(2).max(80),
  locationScope: z.enum(["city", "area"]).default("area"),
  maxDistance: z.number().min(1).max(100).default(15),
  vibes: z.array(z.enum(vibes)).max(12).default([]), interests: z.string().max(1000).default(""),
  includeFood: z.boolean().default(true), avoidRestaurants: z.boolean().default(false),
});
export type NearbySearch = z.infer<typeof nearbySearchSchema>;
export const nearbyPlaceSchema = z.object({
  id: z.string().min(1).max(200), name: z.string(), address: z.string(), category: z.string(), distanceKm: z.number().nonnegative(), reason: z.string(),
  mapsUrl: z.url({ protocol: /^https$/ }),
  attributions: z.array(z.object({ name: z.string(), url: z.url({ protocol: /^https$/ }).optional() })),
  photo: z.object({ url: z.url({ protocol: /^https$/ }), authors: z.array(z.object({ name: z.string(), url: z.url({ protocol: /^https$/ }).optional() })) }).optional(),
  story: dateStorySchema.optional(),
});
export const nearbyResultSchema = z.object({
  area: z.string(), city: z.string(), country: z.string(), places: z.array(nearbyPlaceSchema).max(3),
  sessionId: z.uuid().optional(),
  ai: z.boolean().optional(), headline: z.string().max(90).optional(), introduction: z.string().max(350).optional(),
  warnings: z.array(z.string()).max(8).optional(),
});
export type NearbyResult = z.infer<typeof nearbyResultSchema>;
