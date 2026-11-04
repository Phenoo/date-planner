import { z } from "zod";
import { citySearchSchema } from "@/lib/maps/cities";
import { destinationTimeZone } from "@/lib/maps/resolve-time-zone";
import { coordinatesSchema } from "@/lib/maps/schema";
import { geocodeLocation } from "@/lib/maps/google";
import { locationFromGeocode } from "@/lib/maps/location";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function locate(request: Request) {
  try {
    const input = z.union([coordinatesSchema, citySearchSchema]).safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Choose a valid location.", 400);
    await enforcePlannerLimit(request);
    if ("city" in input.data) return Response.json({ timeZone: await destinationTimeZone(input.data.city, input.data.country) }, { headers: { "Cache-Control": "no-store" } });
    const result = locationFromGeocode(await geocodeLocation(input.data));
    if (!result) throw new RequestError("We couldn't determine your neighborhood. Please choose it manually.", 422);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
