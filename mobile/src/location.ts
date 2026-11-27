type Position = { coords: { latitude: number; longitude: number } };
type LocationSignal = Pick<AbortSignal, "aborted" | "addEventListener" | "removeEventListener">;
type LocationService = {
  requestForegroundPermissionsAsync: () => Promise<{ granted: boolean }>;
  hasServicesEnabledAsync: () => Promise<boolean>;
  watchPositionAsync: (success: (position: Position) => void) => Promise<{ remove: () => void }>;
};
export type LocationResult =
  | { coordinates: { lat: number; lng: number } }
  | { locationError: { code: 1 | 2 | 3; message: string } };

function abortedLocation() {
  const error = new Error("Location request canceled.");
  error.name = "AbortError";
  return error;
}

export async function getAppCoordinates(source: LocationService, signal: LocationSignal, timeoutMs = 15000): Promise<LocationResult> {
  if (signal.aborted) throw abortedLocation();
  const permission = await source.requestForegroundPermissionsAsync();
  if (signal.aborted) throw abortedLocation();
  if (!permission.granted) return { locationError: { code: 1, message: "Allow location for A Date At las in your device settings, or choose a city manually." } };
  const enabled = await source.hasServicesEnabledAsync();
  if (signal.aborted) throw abortedLocation();
  if (!enabled) return { locationError: { code: 2, message: "Turn on your device’s Location Services, or choose a city manually." } };
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { remove: () => void } | undefined;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); subscription?.remove(); };
    const finish = (result: LocationResult) => { if (settled) return; settled = true; cleanup(); resolve(result); };
    const cancel = () => { if (settled) return; settled = true; cleanup(); reject(abortedLocation()); };
    const timer = setTimeout(() => finish({ locationError: { code: 3, message: "Your device took too long to find its location. Try again or choose a city manually." } }), timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    const unavailable = () => finish({ locationError: { code: 2, message: "Your location couldn't be determined. Try again or choose a city manually." } });
    try {
      void source.watchPositionAsync(position => {
        const { latitude: lat, longitude: lng } = position.coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) unavailable();
        else finish({ coordinates: { lat, lng } });
      }).then(value => { if (settled) value.remove(); else subscription = value; }, unavailable);
    } catch { unavailable(); }
  });
}
