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
  const app = initializeApp({ projectId: target, credential: cert({ projectId: target, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }) }, 'catalog-import');
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
