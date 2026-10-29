import { locationResponseSchema, type Coordinates } from "./schema";

export function browserLocationError(code: number) {
  switch (code) {
    case 1: return "Location access is blocked. Allow location for this site in your browser settings, then try again. You can also choose an area manually.";
    case 2: return "Your device couldn't determine its location. Check that Location Services is on, then try again or choose an area manually.";
    case 3: return "Your device took too long to find its location. Try again or choose an area manually.";
    default: return "Your location couldn't be detected. Try again or choose an area manually.";
  }
}

export async function resolveLocation(
  coordinates: Coordinates,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 18000,
) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException("Location lookup timed out", "TimeoutError")), timeoutMs);
  try {
    const response = await fetcher("/api/location", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coordinates), signal: controller.signal,
    });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The location service is unavailable. Please try again shortly.");
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Your area couldn't be found. Please try again.");
    }
    const detected = locationResponseSchema.safeParse(data);
    if (!detected.success) throw new Error("Your area couldn't be identified. Try again or choose it manually.");
    signal.throwIfAborted();
    return detected.data;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw new Error("Finding your area took too long. Check your connection and try again, or choose an area manually.");
    if (error instanceof TypeError) throw new Error("We couldn't reach the location service. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
