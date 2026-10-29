import { plannerAction } from "@/lib/server/planner-gateway";
export async function POST(request: Request) { return plannerAction("chat", request); }
