import { z } from "zod";
import type { NearbyResult } from "@/lib/maps/schema";

export const vibes = [
  "Romantic",
  "Adventurous",
  "Relaxed",
  "Playful",
  "Luxurious",
  "Creative",
  "Food & dining",
  "Outdoors",
  "Entertainment",
  "Private",
  "Active",
  "Unexpected",
] as const;
export const occasions = [
  "First date",
  "Casual date",
  "Romantic date",
  "Anniversary",
  "Birthday",
  "Surprise date",
  "Reconnecting",
  "Just because",
  "Celebration",
  "Adventure together",
] as const;
export const areas = ["Lekki", "Victoria Island", "Ikoyi", "Ikeja"] as const;
export const cities = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
  "Ibadan",
  "Enugu",
  "Benin City",
] as const;
export const genderOptions = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non-binary", label: "Non-binary" },
  { value: "", label: "Prefer not to say" },
] as const;
const genderSchema = z.enum(["woman", "man", "non-binary", ""]).default("");
export function genderLabel(value: z.infer<typeof genderSchema>) {
  return genderOptions.find((option) => option.value === value)?.label ?? "Prefer not to say";
}

export const requestSchema = z.object({
  country: z.string().trim().min(2).max(80).default("Nigeria"),
  city: z.string().trim().min(2).max(80),
  currentCity: z.string().trim().max(80).default(""),
  locationScope: z.enum(["city", "area"]).default("area"),
  area: z.string().trim().min(2).max(80),
  startingArea: z.string().trim().max(80).default(""),
  maxDistance: z.number().min(1).max(100).default(15),
  meetingTogether: z.boolean().default(true),
  transport: z
    .enum(["Ride-hailing", "Driving", "Walking"])
    .default("Ride-hailing"),
  occasion: z.string().trim().min(2).max(100),
  budget: z.number().int().min(1000).max(10000000).nullable(),
  budgetType: z.enum(["total", "per-person"]).default("total"),
  guests: z.number().int().min(1).max(12).default(2),
  yourGender: genderSchema,
  dateGender: genderSchema,
  includeTransport: z.boolean().default(true),
  includeFood: z.boolean().default(true),
  contingency: z.boolean().default(true),
  vibes: z.array(z.enum(vibes)).min(1).max(12),
  interests: z.string().trim().max(1000).default(""),
  dislikes: z.string().trim().max(500).default(""),
  dietary: z
    .array(z.enum(["vegetarian", "vegan", "halal", "gluten-free"]))
    .max(4)
    .default([]),
  accessibility: z.boolean().default(false),
  quiet: z.boolean().default(false),
  surprises: z.boolean().default(true),
  datePreference: z.enum(["weekday", "weekend"]).default("weekend"),
  date: z.union([z.literal(""), z.iso.date()]).default(""),
  startTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).default(""),
  duration: z.number().int().min(60).max(720),
  endTime: z
    .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)])
    .default(""),
  environment: z.enum(["any", "indoor", "outdoor"]).default("any"),
  flexible: z.boolean().default(false),
  notes: z.string().trim().max(2000).default(""),
  avoidRestaurants: z.boolean().default(false),
});
export type PlanRequest = z.infer<typeof requestSchema>;
export const generateSchema = z.object({
  request: requestSchema,
  lockedIds: z.array(z.string().max(100)).max(4).default([]),
  excludeIds: z.array(z.string().max(100)).max(30).default([]),
  preferredIds: z.array(z.string().max(100)).max(4).default([]),
  mode: z
    .enum(["balanced", "cheaper", "closer", "special"])
    .default("balanced"),
  variation: z.number().int().min(0).max(1000).default(0),
  excludePlaceIds: z.array(z.string().min(1).max(200)).max(60).default([]),
  likedPlaceCategories: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
});
export type GenerateInput = z.infer<typeof generateSchema>;
export const experienceSchema = z.object({
  id: z.string(),
  name: z.string(),
  venue: z.string(),
  description: z.string(),
  city: z.string(),
  area: z.string(),
  country: z.string(),
  currency: z.literal("NGN"),
  category: z.enum([
    "Art & culture",
    "Food & dining",
    "Nature & outdoors",
    "Fun & games",
    "Unique experiences",
  ]),
  image: z.string(),
  price: z.number().int().nonnegative(),
  priceType: z.enum(["per-person", "group"]),
  duration: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  vibes: z.array(z.string()),
  occasions: z.array(z.string()),
  tags: z.array(z.string()),
  indoor: z.boolean(),
  quiet: z.boolean(),
  accessible: z.boolean().nullable(),
  dietary: z.array(z.string()),
  publicVenue: z.boolean(),
  maxGuests: z.number().int().positive(),
  hours: z.array(
    z.object({
      day: z.number().int().min(0).max(6),
      open: z.number().min(0).max(1440),
      close: z.number().min(0).max(1440),
    }),
  ),
  active: z.boolean(),
  approved: z.boolean(),
  demo: z.boolean(),
  verifiedAt: z.iso.date().nullable(),
  bookingUrl: z.url({ protocol: /^https$/ }).nullable(),
  sourceUrl: z.url({ protocol: /^https$/ }).nullable(),
  reservation: z.string(),
  quality: z.number().min(0).max(1),
});
export type Experience = z.infer<typeof experienceSchema>;
export type PlanActivity = {
  experience: Experience;
  start: number;
  end: number;
  cost: number;
  travelMinutes: number;
  distance: number;
  reason: string;
};
export type ScoreBreakdown = {
  interests: number;
  budget: number;
  location: number;
  occasion: number;
  reliability: number;
};
export type DatePlan = {
  id: string;
  type: "Smart & affordable" | "Best overall match" | "Something special";
  title: string;
  introduction: string;
  score: number;
  scores: ScoreBreakdown;
  activities: PlanActivity[];
  activityCost: number;
  transportCost: number;
  contingencyCost: number;
  total: number;
  remaining: number | null;
  budget: number | null;
  duration: number;
  totalDistance: number;
  returnTravel: number;
  request: PlanRequest;
  demo: boolean;
  tips: string[];
};
export type RecommendationResult = {
  nearby?: NearbyResult;
  plans: DatePlan[];
  warnings: string[];
  diagnostics: {
    id: string;
    name: string;
    eligible: boolean;
    reasons: string[];
    score?: number;
  }[];
  source: "demo" | "firebase";
  ai: boolean;
};
