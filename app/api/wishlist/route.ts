import { plannerAction } from "@/lib/server/planner-gateway";

export function POST(request: Request) {
  return plannerAction("sharedWishlist", request);
}
