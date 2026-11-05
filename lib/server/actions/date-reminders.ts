import { dateReminderInputSchema, enableDateReminder } from "@/lib/server/date-reminders";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function dateReminders(request: Request) {
  try {
    const input = dateReminderInputSchema.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Please choose a valid saved date for your reminder.", 400);
    await enforcePlannerLimit(request);
    return Response.json(await enableDateReminder(request, input.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
