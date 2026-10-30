import { z } from "zod";
import { authenticatedClient } from "@/lib/firebase/server";
import { apiError, readJson, RequestError } from "@/lib/planner/http";
import { processDeletion } from "@/lib/server/account-privacy";
export async function GET(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true) throw new RequestError("Admin access required.", 403);
    const rows = await auth.db.collection("accountDeletionRequests").where("status", "in", ["requested", "processing"]).orderBy("requestedAt", "asc").limit(50).get();
    return Response.json({ requests: rows.docs.map((row) => ({ id: row.id, status: row.data().status, requestedAt: row.data().requestedAt.toDate().toISOString(), retryAt: row.data().disabledAt?.toMillis() ? row.data().disabledAt.toMillis() + 600000 : null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticatedClient(request);
    if (!auth || auth.user.admin !== true) throw new RequestError("Admin access required.", 403);
    const parsed = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError("Choose a deletion request.", 400);
    return Response.json(await processDeletion(parsed.data.id, auth.user.uid));
  } catch (error) { return apiError(error); }
}
