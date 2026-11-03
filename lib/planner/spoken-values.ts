const small: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const scales: Record<string, number> = { thousand: 1000, million: 1000000 };
const numberWords = [...Object.keys(small), "hundred", ...Object.keys(scales)].join("|");
const amountPattern = new RegExp(`\\b((?:${numberWords})(?:[\\s-]+(?:${numberWords}|and))*)\\b(?:\\s+(k|grand)\\b)?`, "gi");

function belowHundred(words: string[]): number | null {
  if (!words.length) return 0;
  const first = Object.hasOwn(small, words[0]) ? small[words[0]] : undefined;
  if (first === undefined) return null;
  if (words.length === 1) return first;
  const second = Object.hasOwn(small, words[1]) ? small[words[1]] : undefined;
  return words.length === 2 && first >= 20 && second !== undefined && second > 0 && second < 10 ? first + second : null;
}
function belowThousand(words: string[]) {
  if (words[1] !== "hundred") return belowHundred(words);
  const hundreds = small[words[0]];
  if (!hundreds || hundreds > 9) return null;
  const rest = words.slice(words[2] === "and" ? 3 : 2);
  const remainder = belowHundred(rest);
  return remainder === null ? null : hundreds * 100 + remainder;
}
function wordNumber(text: string): number | null {
  const words = text.toLowerCase().split(/[\s-]+/);
  const group: string[] = [];
  let total = 0;
  let previousScale = Infinity;
  for (const word of words) {
    if (!Object.hasOwn(scales, word)) { group.push(word); continue; }
    const scale = scales[word];
    if (scale >= previousScale) return null;
    if (total && group[0] === "and") group.shift();
    const value = belowThousand(group);
    if (!value) return null;
    total += value * scale; previousScale = scale; group.length = 0;
  }
  if (total && group[0] === "and") group.shift();
  if (group.at(-1) === "and") group.pop();
  const remainder = belowThousand(group);
  return remainder === null ? null : total + remainder;
}

export function explicitSpendingAmounts(message: string, answeringBudget = false) {
  const amounts = message.match(/\d[\d,]*(?:\.\d+)?\s*k?/gi)?.map((value) => Number(value.replace(/[,k\s]/gi, "")) * (/k/i.test(value) ? 1000 : 1)) ?? [];
  if (!answeringBudget && !/\b(budget|spend|spending|limit|naira|total|per person|per head)\b/i.test(message)) return amounts;
  for (const match of message.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(hundred\s+thousand|hundred|thousand|million)\b/gi)) {
    if (/\b(not|minus|negative)\s*$/i.test(message.slice(0, match.index))) continue;
    const unit = match[2].toLowerCase().replace(/\s+/g, " ");
    const scale = unit === "hundred thousand" ? 100000 : unit === "hundred" ? 100 : scales[unit];
    amounts.push(Number(match[1].replace(/,/g, "")) * scale);
  }
  const normalized = message.replace(/\ba(?=\s+(?:hundred|thousand|million)\b)/gi, "one");
  for (const match of normalized.matchAll(amountPattern)) {
    if (/\b(not|minus|negative)\s*$/i.test(normalized.slice(0, match.index))) continue;
    const value = wordNumber(match[1]);
    if (value !== null) amounts.push(value * (match[2] ? 1000 : 1));
  }
  return [...new Set(amounts)];
}

function clockText(message: string) {
  return message.toLowerCase().replace(/([ap])\s*\.\s*m\s*\.?/g, "$1m").replace(/-/g, " ").trim();
}
const hourWords = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
const minuteWord = `${Object.keys(small).join("|")}|oh`;
const clockPattern = new RegExp(`\\b(${hourWords})(?:\\s+((?:${minuteWord})(?:\\s+(?:${minuteWord}))?))?\\s*(am|pm)\\b`, "g");

export function explicitSpokenTimes(message: string) {
  const normalized = clockText(message);
  const matches = [...normalized.matchAll(clockPattern)];
  if (matches.length !== 1) return [];
  const times: string[] = [];
  for (const match of matches) {
    const preceding = normalized.slice(0, match.index).trim().split(/\s+/).at(-1) ?? "";
    if (Object.hasOwn(small, preceding) || /^(hundred|thousand|million|not|or|after|before|between|around|about|past|to|quarter|half)$/.test(preceding)) continue;
    const minuteText = match[2]?.replace(/^(?:oh|zero)\s+/, "") ?? "zero";
    const minutes = belowHundred(minuteText.split(/\s+/));
    if (minutes === null || minutes > 59) continue;
    if (minutes > 0 && minutes < 10 && !/^(oh|zero)\s+/.test(match[2] ?? "")) continue;
    const hour = small[match[1]] % 12 + (match[3] === "pm" ? 12 : 0);
    times.push(`${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
  }
  return times.length === 1 ? times : [];
}

export function spokenClockReply(message: string) {
  const normalized = clockText(message).replace(/^(?:start(?:ing)?(?: the date)?(?: at)?\s+|at\s+)/, "").replace(/[.!]$/, "");
  const match = new RegExp(`^(?:${clockPattern.source})$`).test(normalized);
  return match ? explicitSpokenTimes(normalized)[0] ?? null : null;
}

export function normalizeClockPunctuation(message: string) {
  return clockText(message);
}
