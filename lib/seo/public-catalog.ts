import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getCatalog } from "@/lib/planner/catalog";

export const publicCatalog = cache(async () => {
  await connection();
  return getCatalog();
});
