import { catalogReviewIssues } from "./catalog-review";
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
    .limit(1000)
    .get();
  if (!data.docs.length) return [];
  const records = data.docs.map((doc) => decodeExperience(doc.data().record));
  const blocked = await venueControls();
  const invalid = records.filter(record => !record.success).length;
  if (invalid) console.warn("Catalog records withheld pending review", { count: invalid });
  return records.flatMap((record) => record.success ? [record.data] : [])
    .filter(
      (record) =>
        !record.demo &&
        record.approved &&
        record.active &&
        !blocked.has(record.id) &&
        record.verifiedAt &&
        record.sourceUrl && !catalogReviewIssues(record).length,
    );
}
