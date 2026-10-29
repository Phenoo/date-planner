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
  dislikes: z.string().max(500).default(""), notes: z.string().max(2000).default(""),
  includeFood: z.boolean().default(true), avoidRestaurants: z.boolean().default(false),
  date: z.union([z.literal(""), z.iso.date()]).default(""), startTime: z.string().default(""), duration: z.number().min(60).max(720).default(180),
  guests: z.number().int().min(1).max(12).default(2), budget: z.number().nullable().default(null), budgetType: z.enum(["total", "per-person"]).default("total"),
  includeTransport: z.boolean().default(true), transport: z.enum(["Ride-hailing", "Driving", "Walking"]).default("Ride-hailing"),
  accessibility: z.boolean().default(false), dietary: z.array(z.string()).default([]),
});
export type NearbySearch = z.infer<typeof nearbySearchSchema>;
export const nearbyPlaceSchema = z.object({
  id: z.string().min(1).max(200), name: z.string(), address: z.string(), category: z.string(), distanceKm: z.number().nonnegative(), reason: z.string(),
  mapsUrl: z.url({ protocol: /^https$/ }),
  attributions: z.array(z.object({ name: z.string(), url: z.url({ protocol: /^https$/ }).optional() })),
  photo: z.object({ url: z.url({ protocol: /^https$/ }), authors: z.array(z.object({ name: z.string(), url: z.url({ protocol: /^https$/ }).optional() })) }).optional(),
  story: dateStorySchema.optional(),
  details: z.object({
    checkedAt: z.iso.datetime(), opening: z.enum(["fits", "unknown"]), hours: z.array(z.string()), timeZone: z.string().optional(),
    rating: z.number().optional(), reviewCount: z.number().optional(), website: z.url({ protocol: /^https$/ }).optional(), phone: z.string().optional(),
    price: z.object({ currency: z.string().regex(/^[A-Z]{3}$/), min: z.number().nonnegative().optional(), max: z.number().nonnegative().optional() }).optional(),
    travelMinutes: z.number(),
    reviews: z.array(z.object({ author: z.string(), url: z.url({ protocol: /^https$/ }).optional(), text: z.string(), rating: z.number().optional(), when: z.string().optional() })),
  }).optional(),
});
export const nearbyResultSchema = z.object({
  area: z.string(), city: z.string(), country: z.string(), places: z.array(nearbyPlaceSchema).max(3),
  sessionId: z.uuid().optional(),
  ai: z.boolean().optional(), headline: z.string().max(90).optional(), introduction: z.string().max(350).optional(),
  warnings: z.array(z.string()).max(8).optional(),
});
export type NearbyResult = z.infer<typeof nearbyResultSchema>;
