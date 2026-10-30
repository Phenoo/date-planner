import { plannerAction } from "@/lib/server/planner-gateway";
import { readJson, apiError } from "@/lib/planner/http";
export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
  const status = new URL(request.url).searchParams.get("status") || undefined;
  return plannerAction("dateHistory", new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ action: "list", cursor, status }), signal: request.signal }));
}
export async function PATCH(request: Request) {
  try {
    const body = await readJson(request);
    const id = body && typeof body === "object" && "id" in body ? body.id : undefined;
    return plannerAction("dateHistory", new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ action: "complete", id }), signal: request.signal }));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    return plannerAction("dateHistory", new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body), signal: request.signal }));
  } catch (error) { return apiError(error); }
}
