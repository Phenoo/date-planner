import { recurringDateNight } from "@/lib/server/recurring-date-night";

export async function POST(request: Request) {
  return recurringDateNight(request);
}
