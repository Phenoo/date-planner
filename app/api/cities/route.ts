import { cityRecordSchema, citySearchSchema, nearbyCities } from "@/lib/maps/cities";
import cityData from "@/lib/maps/data/cities.json";
import { geocodeLocation } from "@/lib/maps/google";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";

const cities = cityRecordSchema.array().parse(cityData);

export async function POST(request: Request) {
  try {
    const input = citySearchSchema.safeParse(await readJson(request));
    if (!input.success) throw new RequestError("Choose a valid starting city and country.", 400);
    await enforcePlannerLimit(request);
    const geocode = await geocodeLocation(`${input.data.city}, ${input.data.country}`);
    const match = geocode.results[0];
    const origin = match?.geometry?.location;
    const country = match?.address_components.find((part) => part.types.includes("country"))?.short_name;
    if (!origin || !country) throw new RequestError("We couldn't find nearby cities. You can still type a destination.", 422);
    const aliases = match.address_components.filter((part) => part.types.some((type) => ["locality", "postal_town"].includes(type))).map((part) => part.long_name);
    return Response.json(nearbyCities(cities, origin, input.data.city, country, aliases), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
