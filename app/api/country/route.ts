import cityData from "@/lib/maps/data/cities.json";
import { citiesForCountry, cityRecordSchema } from "@/lib/maps/cities";
import { countryFromHeaders } from "@/lib/maps/country";

const countries = citiesForCountry(cityRecordSchema.array().parse(cityData), "").countries;

export function GET(request: Request) {
  return Response.json({ country: countryFromHeaders(request.headers, countries) }, { headers: { "Cache-Control": "private, no-store" } });
}
