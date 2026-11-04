import test from 'node:test';
import assert from 'node:assert/strict';
import { cityTimeZone } from '../lib/maps/destination-time-zone';
import { scheduleError, zonedNow } from '../lib/planner/schedule';
import { intakeNextField, intakeFields } from '../lib/planner/intake';
import { requestSchema } from '../lib/planner/schema';
test('destination zones are matched by city and country, including DST-capable IANA zones', () => {
  for (const [city, country, zone] of [['London', 'UK', 'Europe/London'], ['New York City', 'USA', 'America/New_York'], ['Tokyo', 'Japan', 'Asia/Tokyo'], ['Lagos', 'Nigeria', 'Africa/Lagos'], ['Melbourne', 'Australia', 'Australia/Melbourne'], ['Santiago', 'Chile', 'America/Santiago']]) assert.equal(cityTimeZone(city, country), zone);
  assert.equal(cityTimeZone('An unknown city', 'United States'), null);
  assert.equal(cityTimeZone('London', 'Nigeria'), null);
});
test('unconfirmed destination zones cannot silently produce calendar times or a ready request', () => {
  const request = requestSchema.parse({ city: 'London', country: 'UK', area: 'London', budget: 100, currency: 'GBP', occasion: 'First date', vibes: ['Creative'], duration: 180, date: '2030-01-01', startTime: '12:00', timeZoneConfirmed: false });
  assert.match(scheduleError(request), /time zone/);
  assert.equal(intakeNextField(request, intakeFields), 'time');
  assert.equal(zonedNow('America/New_York', new Date('2030-07-01T15:00:00Z')).time, '11:00');
  assert.equal(zonedNow('America/New_York', new Date('2030-01-01T15:00:00Z')).time, '10:00');
});
