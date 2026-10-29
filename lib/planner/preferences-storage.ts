import { z } from "zod";
import { requestSchema } from "./schema";

export const preferenceSchema = requestSchema
  .pick({
    city: true,
    area: true,
    country: true,
    budget: true,
    budgetType: true,
    vibes: true,
    interests: true,
    dislikes: true,
    dietary: true,
    accessibility: true,
    quiet: true,
    transport: true,
    environment: true,
  })
  .partial();
export type StoredPreferences = z.infer<typeof preferenceSchema>;
