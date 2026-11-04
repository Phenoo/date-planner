import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeJourneys, summarizeWebVitals, webVitalSchema } from '../lib/analytics/metrics';
import { clientEventSchema } from '../lib/planner/funnel';

test('metrics reject private paths and unknown payload fields', () => {
  const sample = { name: 'LCP', value: 2200, device: 'mobile', path: '/plan', id: 'v5-123' };
  assert.equal(webVitalSchema.safeParse(sample).success, true);
  for (const path of ['/invite/private-token', '/plan?notes=private', '/admin']) assert.equal(webVitalSchema.safeParse({ ...sample, path }).success, false);
  assert.equal(webVitalSchema.safeParse({ ...sample, email: 'private' }).success, false);
  assert.equal(webVitalSchema.safeParse({ ...sample, value: Infinity }).success, false);
  assert.equal(webVitalSchema.safeParse({ ...sample, name: 'CLS', value: 101 }).success, false);
});
test('real-user p75 keeps device categories separate and represents no data', () => {
  const result = summarizeWebVitals([1000, 2000, 3000, 5000].map(value => ({ name: 'LCP', device: 'mobile', value })));
  assert.deepEqual(result[0], { name: 'LCP', device: 'mobile', count: 4, p75: 3000, rating: 'needs-improvement' });
  assert.equal(result.find(row => row.name === 'LCP' && row.device === 'desktop')?.p75, null);
  assert.equal(result.find(row => row.name === 'INP')?.rating, 'no-data');
});
test('completion counts unique started journeys and reports only inactive unfinished flows as pauses', () => {
  const now = 10_000_000;
  const result = summarizeJourneys([
    { journey: 'a', event: 'planner_started', createdAt: 1 },
    { journey: 'a', event: 'planner_completed', createdAt: 2 },
    { journey: 'a', event: 'planner_completed', createdAt: 3 },
    { journey: 'a', event: 'recommendation_accepted', createdAt: 4 },
    { journey: 'b', event: 'planner_started', createdAt: 1 },
    { journey: 'b', event: 'planner_step_viewed', step: 'budget', createdAt: 2 },
    { journey: 'c', event: 'planner_started', createdAt: now - 100 },
    { journey: 'unscoped', event: 'invitation_created', createdAt: 3 },
  ], now);
  assert.equal(result.started, 3); assert.equal(result.completed, 1); assert.equal(result.completionRate, 1 / 3); assert.equal(result.pending, 1);
  assert.deepEqual(result.dropoffs, [{ step: 'budget', count: 1 }]);
  assert.equal(result.funnel.find(stage => stage.event === 'invitation_created')?.count, 0);
  assert.equal(summarizeJourneys([]).completionRate, null);
});
test('clients cannot forge authoritative completion or save events', () => {
  const scope = '00000000-0000-4000-8000-000000000001';
  assert.equal(clientEventSchema.safeParse({ event: 'planner_completed', scope }).success, false);
  assert.equal(clientEventSchema.safeParse({ event: 'plan_saved', scope }).success, false);
  assert.equal(clientEventSchema.safeParse({ event: 'planner_step_viewed', scope }).success, false);
  assert.equal(clientEventSchema.safeParse({ event: 'planner_step_viewed', scope, step: 'budget', flowScope: scope }).success, true);
});
