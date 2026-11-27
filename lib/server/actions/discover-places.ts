import { authenticatedClient } from "@/lib/firebase/server";
import { cityDiscoveryResultSchema, cityDiscoverySearchSchema } from "@/lib/maps/place-discovery";
import { attachPlacePhotos, loadPlaceCandidates } from "@/lib/maps/places";
import { nearbySearchSchema } from "@/lib/maps/schema";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

export async function discoverPlaces(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth) throw new RequestError("Your browsing session could not be started. Please try again.", 401);
    const input = cityDiscoverySearchSchema.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Choose a valid city and country to discover places.", 400);
    await enforcePlannerLimit(request);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
    const search = nearbySearchSchema.parse({
      city: input.data.city, country: input.data.country, area: input.data.city,
      locationScope: input.data.coordinates ? "area" : "city", maxDistance: 25, durationMode: "estimated",
      vibes: ["Creative", "Outdoors", "Playful"],
    });
    const { result, records } = await loadPlaceCandidates(search, input.data.coordinates, { limit: 12, excludeIds: input.data.excludeIds, signal });
    const enriched = await attachPlacePhotos(result, records);
    signal.throwIfAborted();
    const discovery = cityDiscoveryResultSchema.parse({ ...enriched, places: enriched.places.map((place) => ({ ...place, reason: `${place.category} in ${input.data.city}.` })) });
    return Response.json(discovery, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
