export type PlaceDecision = "keep" | "skip";
export type PlaceChoice<T extends { id: string }> = { place: T; decision: PlaceDecision };

export function recordPlaceChoice<T extends { id: string }>(history: readonly PlaceChoice<T>[], place: T, decision: PlaceDecision): PlaceChoice<T>[] {
  if (history.some((choice) => choice.place.id === place.id)) return [...history];
  return [...history, { place, decision }];
}

export function remainingPlaces<T extends { id: string }>(places: readonly T[], history: readonly PlaceChoice<T>[]) {
  const seen = new Set(history.map((choice) => choice.place.id));
  return places.filter((place) => !seen.has(place.id));
}

export function cardSwipeMotion(deltaX: number, bounds: { width: number; height: number; availableWidth: number }) {
  const { width, height, availableWidth } = bounds;
  if (![deltaX, width, height, availableWidth].every(Number.isFinite) || width <= 0 || height <= 0) return { x: 0, rotation: 0 };
  const clearance = Math.max(0, (availableWidth - width) / 2 - 8);
  if (!clearance) return { x: 0, rotation: 0 };
  // Reserve half the clearance for travel and half for the rotated corners.
  const travel = Math.min(64, width * .18, clearance / 2);
  const tilt = Math.min(3, clearance / height * 180 / Math.PI);
  const progress = Math.tanh(deltaX / 80);
  return { x: travel * progress, rotation: tilt * progress };
}

export function swipeDecision(deltaX: number, deltaY: number, width: number): PlaceDecision | null {
  if (![deltaX, deltaY, width].every(Number.isFinite) || width <= 0 || Math.abs(deltaY) > Math.abs(deltaX)) return null;
  const threshold = Math.max(64, Math.min(110, width * .23));
  if (Math.abs(deltaX) < threshold) return null;
  return deltaX > 0 ? "keep" : "skip";
}
