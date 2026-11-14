import "server-only";
import { FieldValue, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import type { z } from "zod";
import { planningOrigin } from "@/lib/maps/google";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { loadPlaceCandidates } from "@/lib/maps/places";
import { mapNearbyPlaces } from "@/lib/maps/nearby";
import { hasQualifyingGoogleRating } from "@/lib/maps/recommendation-quality";
import { venueOpeningStatus } from "@/lib/maps/venue-facts";
import { backupPlaceSchema, type historyInputSchema } from "@/lib/planner/invitations";
import { RequestError } from "@/lib/planner/http";
import { scheduleError, timeMinutes } from "@/lib/planner/schedule";
import type { StoredDate } from "./date-invitations";

type DateBackupInput = Extract<z.infer<typeof historyInputSchema>, { action: `${string}-backup` }>;

async function originalGooglePlaceId(db: Firestore, record: StoredDate) {
  if (record.source === "google") return record.placeId;
  const original = await db.collection("experiences").doc(record.placeId).get();
  const placeId = backupPlaceSchema.shape.id.safeParse(original.get("record.placeId"));
  if (!placeId.success) throw new RequestError("The original venue couldn't be identified on Maps.", 409);
  return placeId.data;
}

export async function manageDateBackup(signal: AbortSignal, db: Firestore, snapshot: DocumentSnapshot, record: StoredDate, input: DateBackupInput) {
  if (input.action === "read-backup") {
    if (!record.backupPlaceId) return { placeId: null, place: null };
    const details = await loadPlaceDetails(record.backupPlaceId, false).catch(() => null);
    const place = details?.operational && hasQualifyingGoogleRating(details.record.rating) ? backupPlaceSchema.parse(details.place) : null;
    const preferences = record.planningRequest;
    const nowClosed = place && details && preferences && venueOpeningStatus(details.record, preferences.date, timeMinutes(preferences.startTime), 1) === "closed";
    return { placeId: record.backupPlaceId, place, ...(nowClosed ? { closedAtPlannedTime: true } : {}) };
  }
  if (input.action === "remove-backup" && !record.backupPlaceId) return { removed: true };
  if (input.action === "save-backup" && record.backupPlaceId === input.placeId) return { saved: true };
  if (input.action !== "suggest-backup" && input.previousPlaceId !== (record.backupPlaceId ?? null)) {
    throw new RequestError("Your backup changed. Reopen the date to see the latest venue.", 409);
  }
  if (input.action !== "remove-backup") {
    if (record.dateStatus === "completed" || !record.planningRequest) throw new RequestError("Choose an upcoming date with saved planning details to find a backup.", 409);
    const preferences = record.planningRequest;
    const invalid = scheduleError(preferences);
    if (invalid) throw new RequestError(invalid, 400);
    const [primary, origin] = await Promise.all([originalGooglePlaceId(db, record), planningOrigin(preferences)]);
    if (!origin) throw new RequestError("We couldn't check the location for your backup. Try again shortly.", 503);

    if (input.action === "suggest-backup") {
      const excludeIds = record.backupPlaceId ? [primary, record.backupPlaceId] : [primary];
      const { result } = await loadPlaceCandidates(preferences, origin, { excludeIds, signal, limit: 8 });
      const candidate = result.places.find((place) => place.details?.opening === "fits") ?? result.places[0];
      return { place: candidate ? backupPlaceSchema.parse(candidate) : null };
    }

    if (input.placeId === primary) throw new RequestError("Choose a different venue for your backup.", 409);
    const { record: venue } = await loadPlaceDetails(input.placeId, false);
    if (!mapNearbyPlaces({ places: [venue] }, origin, preferences, 1).places.length) {
      throw new RequestError("This venue no longer fits your date. Look for another backup.", 409);
    }
  }

  signal.throwIfAborted();
  return db.runTransaction(async (tx) => {
    const current = await tx.get(snapshot.ref);
    if (!snapshot.updateTime || !current.updateTime?.isEqual(snapshot.updateTime)) {
      throw new RequestError("This date changed. Reopen it and try again.", 409);
    }
    if (input.action === "remove-backup") {
      tx.update(snapshot.ref, { backupPlaceId: FieldValue.delete() });
      return { removed: true };
    }
    tx.update(snapshot.ref, { backupPlaceId: input.placeId });
    return { saved: true };
  });
}
