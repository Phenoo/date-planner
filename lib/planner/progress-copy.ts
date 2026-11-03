const stages: Record<string, string> = {
  "Planning your date": "Looking for a date that suits you",
  "Preserving your guest session": "Getting things ready for you",
  "Preparing your recommendations": "Taking a look at your choices",
  "Retrieving verified experiences": "Looking through the places we have details for",
  "Checking budgets, opening hours, and schedules": "Checking the cost, opening hours and time you have",
  "Understanding your kind of date": "Getting a feel for what you’d enjoy",
  "Finding real places for your date": "Looking for real places around your destination",
  "Matching places to your preferences": "Seeing which places fit what you’ve told us",
  "Checking the final details": "Giving the details one last check",
};

export function planningStageCopy(stage: string) {
  return Object.hasOwn(stages, stage) ? stages[stage] : stage;
}
