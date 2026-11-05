import { coordinatesSchema, locationResponseSchema, type Coordinates } from "./schema";
import { countryEstimateSchema } from "./country";

export async function resolveCountry(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  signal.throwIfAborted();
  const response = await fetcher("/api/country", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
  if (!response.ok) throw new Error("Country detection is unavailable.");
  const result = countryEstimateSchema.parse(await response.json());
  signal.throwIfAborted();
  return result.country;
}

export function browserLocationError(code: number) {
  switch (code) {
    case 1: return "Location access is blocked. Allow location for this site in your browser settings, then try again. You can also choose an area manually.";
    case 2: return "Your device couldn't determine its location. Check that Location Services is on, then try again or choose an area manually.";
    case 3: return "Your device took too long to find its location. Try again or choose an area manually.";
    default: return "Your location couldn't be detected. Try again or choose an area manually.";
  }
}

export class BrowserLocationFailure extends Error {
  constructor(public readonly code: number) {
    super(browserLocationError(code));
    this.name = "BrowserLocationFailure";
  }
}

type BrowserPositionSource = {
  watchPosition(success: (position: { coords: { latitude: number; longitude: number } }) => void, failure: (error: { code: number }) => void, options: PositionOptions): number;
  clearWatch(id: number): void;
};

export async function getBrowserCoordinates(signal: AbortSignal, source?: BrowserPositionSource, timeoutMs = 5000): Promise<Coordinates> {
  signal.throwIfAborted();
  const geolocation = source ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation);
  if (!geolocation) throw new Error("Location detection isn't supported. Choose your area manually.");
  return new Promise((resolve, reject) => {
    let settled = false;
    let watchId: number | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (watchId !== undefined) geolocation.clearWatch(watchId);
    };
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete();
    };
    const cancel = () => finish(() => reject(signal.reason));
    // Browser acquisition timeouts can exclude time spent waiting for permission.
    const timer = setTimeout(() => finish(() => reject(new BrowserLocationFailure(3))), timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      watchId = geolocation.watchPosition(position => {
        const coordinates = coordinatesSchema.safeParse({ lat: position.coords.latitude, lng: position.coords.longitude });
        finish(() => coordinates.success ? resolve(coordinates.data) : reject(new BrowserLocationFailure(2)));
      }, error => finish(() => reject(new BrowserLocationFailure(error.code))), { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 });
      if (settled) geolocation.clearWatch(watchId);
    } catch (failure) {
      finish(() => reject(new BrowserLocationFailure(failure instanceof DOMException && failure.name === "SecurityError" ? 1 : 2)));
    }
  });
}

export async function resolveLocation(
  coordinates: Coordinates,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 6000,
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
    controller.signal.throwIfAborted();
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
