import { decodeExperience } from "./money";
import { getDatabase } from "@/lib/firebase/server";
import { demoCatalog } from "./demo-catalog";
import { venueControls } from "@/lib/server/venue-controls";

export async function getCatalog() {
  if (process.env.DATE_ATLAS_CATALOG_MODE === "demo") return demoCatalog;
  const data = await getDatabase()
    .collection("experiences")
    .where("active", "==", true)
    .where("approved", "==", true)
    .where("demo", "==", false)
    .limit(200)
    .get();
  const records = data.docs.map((doc) => decodeExperience(doc.data().record));
  const blocked = await venueControls();
  if (records.some((record) => !record.success)) throw new Error("The catalog needs a data review before recommendations are available.");
  return records.flatMap((record) => record.success ? [record.data] : [])
    .filter(
      (record) =>
        !record.demo &&
        record.approved &&
        record.active &&
        !blocked.has(record.id) &&
        record.verifiedAt &&
        record.sourceUrl,
    );
}
