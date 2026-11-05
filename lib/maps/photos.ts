import "server-only";
import { z } from "zod";
import { mapsServerKey } from "./google";

type PhotoSource = { name: string; googleMapsUri?: string; authorAttributions: { displayName: string; uri?: string }[] };
const photoName = /^places\/[\w-]+\/photos\/[\w-]+$/;

export async function placePhoto(source: PhotoSource | undefined) {
  if (!source || !photoName.test(source.name)) return undefined;
  const url = new URL(`https://places.googleapis.com/v1/${source.name}/media`);
  url.searchParams.set("maxHeightPx", "800");
  url.searchParams.set("maxWidthPx", "1000");
  url.searchParams.set("skipHttpRedirect", "true");
  const key = mapsServerKey();
  const response = await fetch(url, { headers: { "X-Goog-Api-Key": key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000) });
  if (!response.ok) return undefined;
  const data = z.object({ photoUri: z.url({ protocol: /^https$/ }) }).safeParse(await response.json());
  if (!data.success || data.data.photoUri.includes(key)) return undefined;
  const host = new URL(data.data.photoUri).hostname;
  if (!host.endsWith(".googleusercontent.com") && !host.endsWith(".ggpht.com")) return undefined;
  const sourceUrl = z.url({ protocol: /^https$/ }).safeParse(source.googleMapsUri);
  return { url: data.data.photoUri, ...(sourceUrl.success && !sourceUrl.data.includes(key) ? { sourceUrl: sourceUrl.data } : {}), authors: source.authorAttributions.map((author) => {
    const link = author.uri?.startsWith("//") ? `https:${author.uri}` : author.uri;
    const parsed = z.url({ protocol: /^https$/ }).safeParse(link);
    return { name: author.displayName, ...(parsed.success ? { url: parsed.data } : {}) };
  }) };
}

export async function placePhotos(sources: readonly PhotoSource[] = []) {
  const unique = [...new Map(sources.filter((source) => photoName.test(source.name)).map((source) => [source.name, source])).values()].slice(0, 6);
  const results = await Promise.allSettled(unique.map(placePhoto));
  const photos = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  return [...new Map(photos.map((photo) => [photo.url, photo])).values()];
}
