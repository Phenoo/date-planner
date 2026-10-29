export type PlaceDirection = "next" | "previous";

export function rotatePlaceDeck<T>(places: readonly T[], position: number): T[] {
  if (!places.length) return [];
  const index = Number.isFinite(position) ? ((Math.trunc(position) % places.length) + places.length) % places.length : 0;
  return [...places.slice(index), ...places.slice(0, index)];
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

export function swipeDirection(deltaX: number, deltaY: number, width: number): PlaceDirection | null {
  if (![deltaX, deltaY, width].every(Number.isFinite) || width <= 0 || Math.abs(deltaY) > Math.abs(deltaX)) return null;
  const threshold = Math.max(64, Math.min(110, width * .23));
  if (Math.abs(deltaX) < threshold) return null;
  return deltaX < 0 ? "next" : "previous";
}
