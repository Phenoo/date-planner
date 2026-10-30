import { plannerAction } from "@/lib/server/planner-gateway";
import { readJson, apiError } from "@/lib/planner/http";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return plannerAction("invitations", new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ action: "read", token }), signal: request.signal }));
}
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await readJson(request);
    const input = body && typeof body === "object" ? body : {};
    const action = "action" in input && input.action === "suggest" ? "suggest" : "reply";
    return plannerAction("invitations", new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...input, action, token }), signal: request.signal }));
  } catch (error) { return apiError(error); }
}
