const lagosNeighborhoods = [
  { area: "Lekki", pattern: /\blekki\b/i },
  { area: "Ikoyi", pattern: /\bikoyi\b/i },
  { area: "Ikeja", pattern: /\bikeja\b/i },
  { area: "Victoria Island", pattern: /\bvictoria\s+island\b/i },
];

export function explicitLagosNeighborhood(message: string, extractedArea: string | undefined, allowDirectAnswer: boolean) {
  const matches = lagosNeighborhoods.flatMap((place) => {
    const match = place.pattern.exec(message);
    return match ? [{ ...place, match }] : [];
  });
  if (matches.length !== 1) return null;
  const { area, pattern, match } = matches[0];
  const before = message.slice(0, match.index).trimEnd();
  const after = message.slice(match.index + match[0].length);
  if (/(?:\b(?:no|not|avoid|except|excluding|outside|maybe|perhaps|either|between)|other\s+than|don['’]t\s+want|do\s+not\s+want)(?:\s+(?:a|the)\s+date)?(?:\s+(?:in|at|around|near))?$/i.test(before)) return null;
  if (/\b(?:was|were|used\s+to\s+(?:live|stay|work|be)|previously|formerly)(?:\s+(?:in|at|around|near))?$/i.test(before) || /^\s*or\b/i.test(after)) return null;
  if (extractedArea) {
    return pattern.exec(extractedArea.trim())?.index === 0 ? extractedArea : null;
  }
  if (!allowDirectAnswer) return null;
  const direct = message.trim().replace(/[.!]+$/, "").replace(/^(?:(?:i['’]m|i\s+am|we['’]re|we\s+are)\s+)?(?:in|at|around|near)\s+/i, "");
  return direct.toLowerCase() === area.toLowerCase() ? area : null;
}
