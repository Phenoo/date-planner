import "server-only";
import { getDatabase } from "@/lib/firebase/server";
import { placeIdSchema } from "@/lib/planner/venue-control";
export async function venueControls() {
  if (process.env.DATE_ATLAS_CATALOG_MODE === "demo") return new Set<string>();
  const rows = await getDatabase().collection("venueControls").where("disabled", "==", true).select("placeId").get();
  return new Set(rows.docs.map((row) => placeIdSchema.parse(row.data().placeId)));
}
