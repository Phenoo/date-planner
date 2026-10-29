import "server-only";
import { mapsServerKey } from "./google";
import { placePhoto } from "./photos";
import { placesResponseSchema } from "./nearby";
import { invitationPlaceSchema } from "@/lib/planner/invitations";
import { RequestError } from "@/lib/planner/http";
import { z } from "zod";

export async function loadPlaceDetails(id: string, withPhoto = true) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { "X-Goog-Api-Key": mapsServerKey(), "X-Goog-FieldMask": "id,displayName,formattedAddress,primaryTypeDisplayName,location,types,businessStatus,attributions,photos,regularOpeningHours,currentOpeningHours,timeZone,priceRange,rating,userRatingCount,reviews,websiteUri,nationalPhoneNumber,accessibilityOptions,servesVegetarianFood" },
  });
  if (!response.ok) throw new RequestError("Place details are temporarily unavailable. Please try again.", 503);
  const parsed = placesResponseSchema.safeParse({ places: [await response.json()] });
  const record = parsed.success ? parsed.data.places[0] : undefined;
  if (!record || record.id !== id) throw new RequestError("We couldn't confirm this place. Please try again.", 503);
  const maps = new URL("https://www.google.com/maps/search/");
  maps.searchParams.set("api", "1"); maps.searchParams.set("query", record.displayName.text); maps.searchParams.set("query_place_id", record.id);
  const photo = withPhoto ? await placePhoto(record.photos[0]).catch(() => undefined) : undefined;
  const place = invitationPlaceSchema.parse({
    id: record.id, name: record.displayName.text, address: record.formattedAddress,
    category: record.primaryTypeDisplayName?.text ?? "Place to explore", mapsUrl: maps.toString(),
    attributions: record.attributions.flatMap((item) => {
      if (!item.provider) return [];
      const url = z.url({ protocol: /^https$/ }).safeParse(item.providerUri);
      return [{ name: item.provider, ...(url.success ? { url: url.data } : {}) }];
    }), ...(photo ? { photo } : {}),
  });
  return { place, record, operational: record.businessStatus === "OPERATIONAL" };
}
