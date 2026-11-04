import data from "./data/currencies.json";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const names = new Intl.DisplayNames(["en"], { type: "region" });
const regions = new Map(Object.entries(data.regions).flatMap(([code, currency]): [string, string][] => [[normalize(code), currency], [normalize(names.of(code) ?? code), currency]]));
const aliases: Record<string, string> = { uk: "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", usa: "US", "u.s.a.": "US", "united states of america": "US", turkey: "TR", "ivory coast": "CI", "south korea": "KR", "north korea": "KP", "united arab emirates": "AE", uae: "AE" };
const codes = new Set<string>(data.codes);
export const currencyOptions = [...new Set(Object.values(data.regions))].sort();

export function validCurrency(value: string) { return codes.has(value); }
export function currencyForCountry(country: string) {
  const value = normalize(country);
  return regions.get(value) ?? regions.get(normalize(aliases[value] ?? "")) ?? null;
}
export function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
export function formatMoney(amount: number, currency = "NGN") {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en", { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : currencyDigits(currency) }).format(amount);
}
export function amountPrecisionError(amount: number | null, currency: string) {
  if (amount === null) return "";
  const digits = currencyDigits(currency);
  const scaled = amount * 10 ** digits;
  return Math.abs(scaled - Math.round(scaled)) > 1e-7 ? `Use at most ${digits} decimal places for ${currency}.` : "";
}
export function toMinorUnits(amount: number, currency = "NGN") {
  const value = Math.round(amount * 10 ** currencyDigits(currency));
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(value)) throw new Error("Invalid monetary amount.");
  return value;
}
export function fromMinorUnits(amount: number, currency = "NGN") {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid minor-unit amount.");
  return amount / 10 ** currencyDigits(currency);
}
export function budgetSuggestions(currency: string) {
  if (currency === "NGN") return [10000, 25000, 50000, 60000, 100000, 200000];
  const scale = currencyDigits(currency) === 0 ? 100 : ["INR", "KES", "ZAR", "THB", "PHP", "MXN", "TWD"].includes(currency) ? 10 : 1;
  return [25, 50, 75, 100, 150, 250].map((amount) => amount * scale);
}
export function destinationCurrency<T extends { country: string; currency: string; budget: number | null; transportBudget?: number | null; timeZoneConfirmed?: boolean }>(request: T, country: string): T {
  const currency = currencyForCountry(country) ?? request.currency;
  return { ...request, country, currency, ...(country !== request.country ? { timeZoneConfirmed: false } : {}), ...(currency !== request.currency ? { budget: null, transportBudget: null } : {}) };
}
