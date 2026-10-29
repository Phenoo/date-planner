import { nearbySearchSchema } from "@/lib/maps/schema";
import { nearbyPlaces } from "@/lib/maps/places";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function places(request: Request) {
  try {
    const input = nearbySearchSchema.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Choose a valid city and area.", 400);
    await enforcePlannerLimit(request);
    return Response.json(await nearbyPlaces(input.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
