import "server-only";
import { z } from "zod";
import { mapsServerKey } from "./google";

type PhotoSource = { name: string; authorAttributions: { displayName: string; uri?: string }[] };

export async function placePhoto(source: PhotoSource | undefined) {
  if (!source || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(source.name)) return undefined;
  const url = new URL(`https://places.googleapis.com/v1/${source.name}/media`);
  url.searchParams.set("maxHeightPx", "800");
  url.searchParams.set("maxWidthPx", "1000");
  url.searchParams.set("skipHttpRedirect", "true");
  const key = mapsServerKey();
  const response = await fetch(url, { headers: { "X-Goog-Api-Key": key }, cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!response.ok) return undefined;
  const data = z.object({ photoUri: z.url({ protocol: /^https$/ }) }).safeParse(await response.json());
  if (!data.success || data.data.photoUri.includes(key)) return undefined;
  const host = new URL(data.data.photoUri).hostname;
  if (!host.endsWith(".googleusercontent.com") && !host.endsWith(".ggpht.com")) return undefined;
  return { url: data.data.photoUri, authors: source.authorAttributions.map((author) => {
    const link = author.uri?.startsWith("//") ? `https:${author.uri}` : author.uri;
    const parsed = z.url({ protocol: /^https$/ }).safeParse(link);
    return { name: author.displayName, ...(parsed.success ? { url: parsed.data } : {}) };
  }) };
}
