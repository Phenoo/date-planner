import { coordinatesSchema } from "@/lib/maps/schema";
import { geocodeLocation } from "@/lib/maps/google";
import { locationFromGeocode } from "@/lib/maps/location";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function locate(request: Request) {
  try {
    const input = coordinatesSchema.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Choose a valid location.", 400);
    await enforcePlannerLimit(request);
    const result = locationFromGeocode(await geocodeLocation(input.data));
    if (!result) throw new RequestError("We couldn't determine your neighborhood. Please choose it manually.", 422);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
