import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldPath, Timestamp, getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const project = args[args.indexOf("--project") + 1];
if (!args.includes("--project") || !project || project !== process.env.FIREBASE_PROJECT_ID) throw new Error("Pass --project matching FIREBASE_PROJECT_ID explicitly. Dry run is the default; --apply enables writes.");
const apply = args.includes("--apply");
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 1000;
if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw new Error("Choose a scan limit between 1 and 100000 per collection group.");
const credential = process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? cert({ projectId: project, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) : applicationDefault();
const db = getFirestore(initializeApp({ projectId: project, credential }));
for (const [group, lifetime] of [["datePlans", 3600000], ["discoverySessions", 3600000], ["funnelEvents", 30 * 86400000], ["venueReports", 30 * 86400000]]) {
  let scanned = 0, eligible = 0, updated = 0, undated = 0, after;
  while (scanned < limit) {
    let query = db.collectionGroup(group).orderBy(FieldPath.documentId()).limit(Math.min(100, limit - scanned));
    if (after) query = query.startAfter(after);
    const page = await query.get();
    if (page.empty) break;
    for (const row of page.docs) {
      scanned++;
      const data = row.data();
      if (data.expiresAt instanceof Timestamp) continue;
      const timestamp = data.updatedAt instanceof Timestamp ? data.updatedAt : data.createdAt;
      if (!(timestamp instanceof Timestamp)) { undated++; continue; }
      eligible++;
      if (apply) {
        const changed = await db.runTransaction(async (tx) => {
          const current = await tx.get(row.ref);
          if (!current.exists || current.data().expiresAt instanceof Timestamp || !current.updateTime.isEqual(row.updateTime)) return false;
          tx.update(row.ref, { expiresAt: Timestamp.fromMillis(timestamp.toMillis() + lifetime) }); return true;
        });
        if (changed) updated++;
      }
    }
    after = page.docs.at(-1);
  }
  console.log(JSON.stringify({ project, mode: apply ? "apply" : "dry-run", group, scanned, eligible, updated, undatedNeedsReview: undated, scanLimitReached: scanned === limit }));
}
await db.terminate();
