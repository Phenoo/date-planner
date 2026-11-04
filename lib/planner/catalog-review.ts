import type { Experience } from './schema';
import { addCalendarDays } from './schedule';
import { currencyDigits } from './currency';

export function catalogReviewIssues(record: Experience, today = new Date().toISOString().slice(0, 10)) {
  if (record.demo || !record.approved) return [];
  const issues: string[] = [];
  if (!record.sourceUrl || record.priceSource !== 'venue' || !record.priceNote) issues.push('Add a venue price source, price basis and venue-confirmed price.');
  if (!record.hoursSourceUrl || !record.hours.length) issues.push('Add the opening-hours source and weekly hours.');
  if (!record.timeZone) issues.push('Add the venue time zone.');
  if (!record.verifiedAt || record.verifiedAt > today) issues.push('Use the date the sources were actually checked, no later than today.');
  if (!record.verificationExpiresAt || record.verificationExpiresAt < today || record.verifiedAt && (record.verificationExpiresAt < record.verifiedAt || record.verificationExpiresAt > addCalendarDays(record.verifiedAt, 90))) issues.push('Set a review expiry within 90 days of verification and no earlier than today.');
  if (!record.hours.every(hours => hours.close > hours.open)) issues.push('Closing times must follow opening times.');
  const scaled = record.price * 10 ** currencyDigits(record.currency);
  if (Math.abs(scaled - Math.round(scaled)) > 1e-7) issues.push('The price has more decimal places than its currency supports.');
  return issues;
}
export function catalogCoverage(records: Experience[], today = new Date().toISOString().slice(0, 10)) {
  const countries = [...new Set(records.filter(record => !record.demo).map(record => record.country))].sort();
  return countries.map(country => {
    const venues = records.filter(record => record.country === country && !record.demo);
    return { country, cities: [...new Set(venues.map(record => record.city))], ready: venues.filter(record => record.active && record.approved && !catalogReviewIssues(record, today).length).length, needsReview: venues.filter(record => record.approved && catalogReviewIssues(record, today).length > 0).length };
  });
}
