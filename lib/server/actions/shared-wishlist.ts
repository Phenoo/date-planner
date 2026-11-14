import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticatedClient, getDatabase } from "@/lib/firebase/server";
import { loadPlaceDetails } from "@/lib/maps/place-details";
import { loadPlaceCandidates } from "@/lib/maps/places";
import { nearbySearchSchema } from "@/lib/maps/schema";
import { hasQualifyingGoogleRating } from "@/lib/maps/recommendation-quality";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { enforcePlannerLimit } from "@/lib/planner/rate-limit";
import { wishlistEntrySchema, wishlistInputSchema, wishlistLimit, wishlistPlaceSchema } from "@/lib/planner/shared-wishlist";
import { invitationTokenSchema } from "@/lib/planner/invitations";
import { deletionKey } from "../account-privacy";
import { tokenKey } from "../date-invitations";

const listSchema = z.object({
  ownerId: z.string().min(1).max(128),
  token: invitationTokenSchema.nullable(),
  tokenHash: z.string().nullable(),
  entries: z.array(wishlistEntrySchema).max(wishlistLimit),
});
const unavailable = () => new RequestError("This wishlist link is no longer available. Ask for a new link.", 404);

export async function sharedWishlist(request: Request) {
  try {
    const parsed = wishlistInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Check your wishlist request and try again.", 400);
    const input = parsed.data;
    await enforcePlannerLimit(request, "wishlist");
    const db = getDatabase();
    const lists = db.collection("sharedWishlists");
    const accessToken = "token" in input && input.action !== "disable" ? input.token : undefined;
    const hash = accessToken ? tokenKey(accessToken) : null;
    const auth = hash ? null : await authenticatedClient(request);
    if (!hash && (!auth || auth.user.firebase.sign_in_provider === "anonymous")) {
      throw new RequestError("Sign in to open your shared wishlist.", 401);
    }
    const snapshot = auth ? await lists.doc(deletionKey(auth.user.uid)).get()
      : (await lists.where("tokenHash", "==", hash).limit(1).get()).docs[0];
    if (!snapshot) throw unavailable();
    const list = listSchema.safeParse(snapshot.data());
    if (!list.success && snapshot.exists) throw unavailable();
    const current = list.success ? list.data : null;
    const ownerId = auth?.user.uid ?? current?.ownerId;
    if (!ownerId || snapshot.id !== deletionKey(ownerId) || current && (current.ownerId !== ownerId || hash && current.tokenHash !== hash)) throw unavailable();
    const deletion = db.collection("accountDeletionRequests").doc(deletionKey(ownerId));
    if (["processing", "complete"].includes((await deletion.get()).get("status"))) throw unavailable();

    const json = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
    if (input.action === "read") {
      const entries = await Promise.all((current?.entries ?? []).map(async (entry) => {
        const details = await loadPlaceDetails(entry.placeId, false).catch(() => null);
        const place = details?.operational && hasQualifyingGoogleRating(details.record.rating) ? wishlistPlaceSchema.parse(details.place) : null;
        return { ...entry, place };
      }));
      return json({ exists: current !== null, ...(auth ? { shareToken: current?.token ?? null } : {}), entries });
    }
    if (!current && input.action !== "create") throw unavailable();
    if (input.action === "search") {
      const destination = nearbySearchSchema.parse({ city: input.city, country: input.country, area: input.city, locationScope: "city", maxDistance: 25 });
      const { result } = await loadPlaceCandidates(destination, undefined, { queries: [input.query], textOnly: true, signal: request.signal, limit: 5 });
      return json({ places: result.places.map((place) => wishlistPlaceSchema.parse(place)) });
    }
    if (input.action === "add" && !current?.entries.some((entry) => entry.placeId === input.placeId)) {
      const details = await loadPlaceDetails(input.placeId, false);
      if (!details.operational || !hasQualifyingGoogleRating(details.record.rating)) {
        throw new RequestError("This venue is currently unavailable. Choose another place.", 409);
      }
    }

    const shareToken = randomBytes(24).toString("base64url");
    request.signal.throwIfAborted();
    const result = await db.runTransaction(async (tx) => {
      const [latest, deletionRequest] = await Promise.all([tx.get(snapshot.ref), tx.get(deletion)]);
      if (["processing", "complete"].includes(deletionRequest.get("status"))) throw unavailable();
      const checked = listSchema.safeParse(latest.data());
      const list = checked.success ? checked.data : null;
      if (input.action === "create" && !latest.exists) {
        tx.create(snapshot.ref, { ownerId, token: shareToken, tokenHash: tokenKey(shareToken), entries: [], updatedAt: Timestamp.now() });
        return { shareToken };
      }
      if (!list || list.ownerId !== ownerId || hash && list.tokenHash !== hash) throw unavailable();
      if (input.action === "create") return { shareToken: list.token };
      if (input.action === "enable" || input.action === "disable") {
        if (input.action === "enable" && list.token) return { shareToken: list.token };
        if (input.action === "disable" && list.token && input.token !== list.token) throw unavailable();
        const token = input.action === "enable" ? shareToken : null;
        tx.update(snapshot.ref, { token, tokenHash: token ? tokenKey(token) : null, updatedAt: Timestamp.now() });
        return { shareToken: token };
      }
      const existing = list.entries.some((entry) => entry.placeId === input.placeId);
      if (input.action === "add" && existing || input.action === "remove" && !existing) return { saved: true };
      if (input.action === "add" && list.entries.length >= wishlistLimit) throw new RequestError(`This wishlist holds up to ${wishlistLimit} places. Remove one to make room.`, 409);
      const entries = input.action === "add" ? [...list.entries, wishlistEntrySchema.parse(input)] : list.entries.filter((entry) => entry.placeId !== input.placeId);
      tx.update(snapshot.ref, { entries, updatedAt: Timestamp.now() });
      return { saved: true };
    });
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
