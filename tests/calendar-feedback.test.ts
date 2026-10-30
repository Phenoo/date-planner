import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarInstant, dateCalendar } from '../lib/planner/calendar';
import { zonedNow } from '../lib/planner/schedule';
import { dateFeedbackSchema } from '../lib/planner/date-feedback';
import { publicInvitationSchema } from '../lib/planner/invitations';
import { fallbackDateStory } from '../lib/planner/date-story';

test('calendar exports preserve Lagos local time as UTC and duration across midnight', () => {
  assert.equal(calendarInstant('2026-11-07', '18:00', 'Africa/Lagos').toISOString(), '2026-11-07T17:00:00.000Z');
  const date = publicInvitationSchema.parse({ date:'2026-11-07', startTime:'23:00', duration:180, timeZone:'Africa/Lagos', datePreference:'weekend', city:'Lagos', country:'Nigeria', placeId:'test', place:null, story:fallbackDateStory('Park'), response:'pending',dateStatus:'planned', createdAt:'2026-10-30T12:00:00Z' });
  const calendar = dateCalendar(date, 'test-event');
  assert.match(calendar, /DTSTART:20261107T220000Z/);
  assert.match(calendar, /DTEND:20261108T010000Z/);
  assert.match(calendar, /STATUS:TENTATIVE/);
  assert.doesNotMatch(calendar, /STATUS:CONFIRMED/);
});
test('nonexistent daylight-saving times are rejected instead of silently moved', () => {
  assert.throws(() => calendarInstant('2026-03-08', '02:30', 'America/New_York'), /does not exist/);
  const instant = calendarInstant('2026-11-01','01:30','America/New_York');
  assert.equal(zonedNow('America/New_York', instant).time,'01:30');
});
test('calendar fields cannot inject extra properties and fold within UTF-8 limits', () => {
  const date = publicInvitationSchema.parse({ date:'2026-11-07', startTime:'18:00', duration:180, timeZone:'Africa/Lagos', datePreference:'weekend', city:'Lagos\r\nATTENDEE:evil', country:'Nigeria', placeId:'test', place:null, story:fallbackDateStory('Park'), response:'pending',dateStatus:'planned', createdAt:'2026-10-30T12:00:00Z' });
  const output = dateCalendar({...date, city:date.city+'é'.repeat(100)},'safe-id');
  assert.doesNotMatch(output, /^ATTENDEE:/m);
  assert.ok(output.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75));
});
test('post-date feedback requires an explicit attendance answer and complete experience fields', () => {
  const base = {dateId:'a'.repeat(64),relevance:4};
  assert.equal(dateFeedbackSchema.safeParse({...base,attended:false}).success,true);
  assert.equal(dateFeedbackSchema.safeParse({...base,attended:false,enjoyment:5}).success,false);
  assert.equal(dateFeedbackSchema.safeParse({...base,attended:true}).success,false);
  assert.equal(dateFeedbackSchema.safeParse({...base,attended:true,enjoyment:4,costAccuracy:'higher'}).success,true);
  assert.equal(dateFeedbackSchema.safeParse({...base,attended:true,enjoyment:0,costAccuracy:'higher'}).success,false);
});
