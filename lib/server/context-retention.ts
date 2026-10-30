import { Timestamp } from "firebase-admin/firestore";

export function contextExpired(data: { expiresAt?: unknown; createdAt?: unknown; updatedAt?: unknown }, now = Date.now()) {
  const explicit = data.expiresAt;
  const created = data.updatedAt instanceof Timestamp ? data.updatedAt : data.createdAt;
  const deadline = explicit instanceof Timestamp ? explicit.toMillis() : created instanceof Timestamp ? created.toMillis() + 3600000 : 0;
  return deadline <= now;
}
