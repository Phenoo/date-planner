import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { experienceSchema } from '../lib/planner/schema';
import { catalogReviewIssues } from '../lib/planner/catalog-review';
import { encodeExperience } from '../lib/planner/money';
import { toMinorUnits } from '../lib/planner/currency';

const records = await Promise.all((await readdir('data/catalog')).filter(file => file.endsWith('.json')).sort().map(async file => experienceSchema.parse(JSON.parse(await readFile(join('data/catalog', file), 'utf8')))));
for (const record of records) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(record.id)) throw new Error('Invalid catalog ID.');
  const issues = catalogReviewIssues(record);
  if (issues.length) throw new Error(`${record.id}: ${issues.join(' ')}`);
}
if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Duplicate catalog IDs.');
console.log(JSON.stringify({ records: records.map(({ id, country, city, currency, price, verificationExpiresAt }) => ({ id, country, city, currency, price, verificationExpiresAt })), write: process.argv.includes('--write') }, null, 2));
if (process.argv.includes('--write')) {
  const target = process.argv[process.argv.indexOf('--project') + 1];
  if (!target || target !== process.env.FIREBASE_PROJECT_ID) throw new Error('Supply --project matching FIREBASE_PROJECT_ID.');
  const token = process.env.FIREBASE_ADMIN_ACCESS_TOKEN;
  if (token) { await importWithToken(target, token); process.exit(0); }
  const credential = cert({ projectId: target, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') });
  const app = initializeApp({ projectId: target, credential }, 'catalog-import');
  try {
    const db = getFirestore(app);
    for (const record of records) {
      const ref = db.collection('experiences').doc(record.id);
      const result = await db.runTransaction(async tx => {
        if ((await tx.get(ref)).exists && !process.argv.includes('--overwrite-reviewed')) return 'already exists; unchanged';
        tx.set(ref, { record: encodeExperience(record), active: record.active, approved: record.approved, demo: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'source-reviewed-catalog-import' });
        tx.set(ref.collection('priceHistory').doc(), { priceMinorUnits: toMinorUnits(record.price, record.currency), priceType: record.priceType, currency: record.currency, sourceUrl: record.sourceUrl, verifiedAt: record.verifiedAt, changedAt: FieldValue.serverTimestamp(), changedBy: 'source-reviewed-catalog-import' });
        return 'imported';
      });
      console.log(`${record.id}: ${result}`);
    }
  } finally { await deleteApp(app); }
}

function firestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === "object") return { mapValue: { fields: firestoreFields(value) } };
  throw new Error("Unsupported catalog field.");
}
function firestoreFields(value: object) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, firestoreValue(item)])); }
async function importWithToken(project: string, token: string) {
  const root = `projects/${project}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  for (const record of records) {
    const name = `${root}/experiences/${record.id}`;
    const previous = await fetch(`https://firestore.googleapis.com/v1/${name}`, { headers, signal: AbortSignal.timeout(20000) });
    if (previous.status !== 404 && !previous.ok) throw new Error(`Catalog read failed (${previous.status}).`);
    if (previous.ok && !process.argv.includes("--overwrite-reviewed")) { console.log(`${record.id}: already exists; unchanged`); continue; }
    if (previous.ok) throw new Error("Use the authenticated admin editor to update an existing record with token-based import.");
    const audit = { priceMinorUnits: toMinorUnits(record.price, record.currency), priceType: record.priceType, currency: record.currency, sourceUrl: record.sourceUrl, verifiedAt: record.verifiedAt, changedBy: "source-reviewed-catalog-import" };
    const payload = { writes: [{ update: { name, fields: firestoreFields({ record: encodeExperience(record), active: record.active, approved: record.approved, demo: false, updatedBy: "source-reviewed-catalog-import" }) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }] }, { update: { name: `${name}/priceHistory/${randomUUID()}`, fields: firestoreFields(audit) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: "changedAt", setToServerValue: "REQUEST_TIME" }] }] };
    const saved = await fetch(`https://firestore.googleapis.com/v1/${root}:commit`, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    if (!saved.ok) throw new Error(`Catalog write failed (${saved.status}). No existing records were changed.`);
    console.log(`${record.id}: imported`);
  }
}
