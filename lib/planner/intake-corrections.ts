import type { IntakeInput } from "./intake";
import { explicitLagosNeighborhood } from "./intake-location";
import { validCurrency } from "./currency";

export function ambiguousBudgetCurrency(input: IntakeInput) {
  if (!/\d/.test(input.message) || (input.message.match(/\b[A-Z]{3}\b/g) ?? []).some(validCurrency)) return false;
  const dollarCurrencies = ["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "BND", "BBD", "BMD", "BZD", "FJD", "GYD", "JMD", "KYD", "LRD", "NAD", "SBD", "SRD", "TTD", "TWD", "XCD"];
  return /\$|\bdollars?\b/i.test(input.message) && !dollarCurrencies.includes(input.request.currency) || /¥/.test(input.message) && !["JPY", "CNY"].includes(input.request.currency);
}

export function explicitIntakeCorrection(input: IntakeInput) {
  const original = input.message.trim();
  const text = original.replace(/[,;.!]?\s*(?:and\s+)?(?:keep|leave)\s+everything\s+else(?:\s+(?:the\s+same|unchanged|as\s+it\s+is))?[.!]*$/i, "").trim();
  if (!text && /\beverything\s+else\b/i.test(original)) return { acknowledgement: "Everything else stays as we agreed.", patch: {} };
  const correction = /^(?:actually\b|instead\b|(?:change|switch|move)(?:\s+the)?(?:\s+(?:date|destination|location))?\s+to\b)/i.test(text);
  const location = text.replace(/^(?:actually|instead)[,\s]+|^(?:change|switch|move)(?:\s+the)?(?:\s+(?:date|destination|location))?\s+to\s+/i, "");
  const area = /^(?:nigeria|ng)$/i.test(input.request.country) ? explicitLagosNeighborhood(location, undefined, correction || input.nextField === "location") : null;
  if (area) return { acknowledgement: `We’ll plan around ${area}, Lagos. Your other answers are kept.`, patch: { city: "Lagos", country: "Nigeria", area, locationScope: "area" as const } };
  const budget = text.replace(/^(?:actually[,\s]+)?(?:(?:set|change|make)(?:\s+the|\s+my)?\s+budget(?:\s+to)?\s+|(?:my\s+)?budget(?:\s+is|\s+of)?\s+)/i, "");
  const match = budget.match(/^(?:([A-Z]{3}|[₦€£¥$])\s*)?(\d[\d,]*(?:\.\d{1,3})?)\s*(k)?(?:\s+([A-Z]{3}|naira|pounds?|euros?|dollars?|yen))?(?:\s+(total|for\s+both(?:\s+of\s+us)?|for\s+all(?:\s+of\s+us)?|per\s+person|per\s+head|each))?[.!]?$/i);
  if (!match) return null;
  if (input.nextField !== "budget" && !match[1] && !match[4] && !match[5] && !/\bbudget\b/i.test(text)) return null;
  const marker = (match[1] ?? match[4] ?? "").toUpperCase();
  if (/^[A-Z]{3}$/.test(marker) && marker !== "YEN" && !validCurrency(marker)) return null;
  const symbols: Record<string, string> = { "₦": "NGN", "€": "EUR", "£": "GBP", NAIRA: "NGN", POUND: "GBP", POUNDS: "GBP", EURO: "EUR", EUROS: "EUR", YEN: "JPY" };
  const dollar = marker === "$" || /^DOLLARS?$/.test(marker);
  const yen = marker === "¥";
  if (dollar && !["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "BND", "BBD", "BMD", "BZD", "FJD", "GYD", "JMD", "KYD", "LRD", "NAD", "SBD", "SRD", "TTD", "TWD", "XCD"].includes(input.request.currency) || yen && !["JPY", "CNY"].includes(input.request.currency)) return null;
  const currency = dollar || yen ? input.request.currency : symbols[marker] ?? (validCurrency(marker) ? marker : input.request.currency);
  const amount = Number(match[2].replace(/,/g, "")) * (match[3] ? 1000 : 1);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return null;
  const basis = match[5]?.toLowerCase();
  const budgetType = basis ? /^(?:per|each)/.test(basis) ? "per-person" as const : "total" as const : input.request.budgetType;
  return { acknowledgement: "Got it. I’ve updated your spending limit and kept the other details.", patch: { budget: amount, currency, budgetType } };
}
