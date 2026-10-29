import { getCatalog } from "@/lib/planner/catalog";
import { apiError } from "@/lib/planner/http";
import { connection } from "next/server";
export async function GET() {
  await connection();
  try {
    return Response.json(
      { experiences: await getCatalog() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
