import type { Experience } from "@/lib/planner/schema";

type MapStop = Pick<Experience, "lat" | "lng" | "demo">;
const coordinate = (stop: MapStop) => `${stop.lat},${stop.lng}`;

export function placeMapUrl(placeId: string, apiKey: string | undefined) {
  if (!apiKey || !placeId) return null;
  return `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key: apiKey, q: `place_id:${placeId}` })}`;
}

export function areaMapUrl(
  area: string,
  city: string,
  country: string,
  apiKey: string | undefined,
) {
  if (!apiKey || !area.trim() || !city.trim()) return null;
  const params = new URLSearchParams({
    key: apiKey,
    q: `${area}, ${city}, ${country}`,
  });
  return `https://www.google.com/maps/embed/v1/place?${params}`;
}

export function directionsUrl(stops: MapStop[], walking = false) {
  if (!stops.length || stops.some((stop) => stop.demo)) return null;
  const params = new URLSearchParams({
    api: "1",
    destination: coordinate(stops[stops.length - 1]),
    travelmode: walking ? "walking" : "driving",
  });
  if (stops.length > 1) params.set("origin", coordinate(stops[0]));
  if (stops.length > 2)
    params.set("waypoints", stops.slice(1, -1).map(coordinate).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

export function embedMapUrl(
  stops: MapStop[],
  apiKey: string | undefined,
  route = true,
  walking = false,
) {
  if (!apiKey || !stops.length || stops.some((stop) => stop.demo)) return null;
  const params = new URLSearchParams({ key: apiKey });
  if (route && stops.length > 1) {
    params.set("origin", coordinate(stops[0]));
    params.set("destination", coordinate(stops[stops.length - 1]));
    params.set("mode", walking ? "walking" : "driving");
    if (stops.length > 2)
      params.set("waypoints", stops.slice(1, -1).map(coordinate).join("|"));
    return `https://www.google.com/maps/embed/v1/directions?${params}`;
  }
  params.set("q", coordinate(stops[0]));
  return `https://www.google.com/maps/embed/v1/place?${params}`;
}
