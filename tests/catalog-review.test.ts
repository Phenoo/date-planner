import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { experienceSchema, generateSchema } from '../lib/planner/schema';
import { catalogReviewIssues, catalogCoverage } from '../lib/planner/catalog-review';
import { generateSinglePlan } from '../lib/planner/engine';
const records = readdirSync('data/catalog').filter(file => file.endsWith('.json')).map(file => experienceSchema.parse(JSON.parse(readFileSync(`data/catalog/${file}`, 'utf8'))));

test('global source-reviewed starter has priced, current entries and valid local assets', () => {
  assert.equal(records.length, 6);
  assert.equal(new Set(records.map(row => row.currency)).size, 6);
  for (const record of records) { assert.deepEqual(catalogReviewIssues(record, '2026-11-04'), []); assert.ok(existsSync(`public${record.image}`)); assert.ok(!record.tags.includes('meal')); assert.deepEqual(record.dietary, []); }
});
test('review policy rejects expired, future, estimate-only and incomplete approvals', () => {
  const venue = records[0];
  for (const patch of [{ verificationExpiresAt: '2026-11-03' }, { verifiedAt: '2026-11-05' }, { verificationExpiresAt: '2027-12-01' }, { priceSource: 'provider-estimate' }, { hoursSourceUrl: undefined }, { priceNote: undefined }, { timeZone: undefined }]) assert.ok(catalogReviewIssues({ ...venue, ...patch } as typeof venue, '2026-11-04').length);
  assert.equal(catalogCoverage(records, '2026-12-05').reduce((sum, country) => sum + country.needsReview, 0), 6);
});
test('a reviewed free venue works with zero budget and excludes known closures and unsupported meals', () => {
  const source = records.find(row => row.id === 'london-victoria-albert')!;
  const venue = { ...source, verificationExpiresAt: undefined };
  const input = generateSchema.parse({ request: { city: venue.city, country: venue.country, area: venue.area, currency: venue.currency, timeZone: venue.timeZone, budget: 0, occasion: 'First date', vibes: ['Creative'], duration: 180, includeFood: false, transport: 'Walking', includeTransport: false, date: '2026-11-07', startTime: '11:00' } });
  const result = generateSinglePlan(input, [venue], undefined, venue);
  assert.equal(result.plans.length, 1); assert.equal(result.plans[0].total, 0); assert.ok(Number.isFinite(result.plans[0].score));
  assert.equal(generateSinglePlan({ ...input, request: { ...input.request, includeFood: true } }, [venue], undefined, venue).plans.length, 0);
  assert.equal(generateSinglePlan({ ...input, request: { ...input.request, date: '2026-12-25' } }, [venue], undefined, venue).plans.length, 0);
});
