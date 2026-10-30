import { z } from "zod";
import { selectionIdSchema } from "./invitations";
export const dateFeedbackSchema = z.object({ dateId: selectionIdSchema, attended: z.boolean(), relevance: z.number().int().min(1).max(5), enjoyment: z.number().int().min(1).max(5).optional(), costAccuracy: z.enum(["accurate", "higher", "lower", "unknown"]).optional() }).superRefine((value, context) => {
  if (!value.attended && (value.enjoyment !== undefined || value.costAccuracy !== undefined)) context.addIssue({ code: "custom", message: "Attendance is required for post-date feedback." });
  if (value.attended && (value.enjoyment === undefined || value.costAccuracy === undefined)) context.addIssue({ code: "custom", message: "Tell us how the date went and whether costs matched." });
});
