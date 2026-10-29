import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlanningResponse } from "../lib/firebase/planner-client";

test("an upstream HTML error produces a useful retry message instead of a JSON parser error", async () => {
  const response = new Response("<html>Service unavailable</html>", { status: 503, headers: { "Content-Type": "text/html" } });
  await assert.rejects(readPlanningResponse(response, () => {}), /Your answers are safe/);
});

test("streamed planning stages deliver the final response to the caller", async () => {
  const stages: string[] = [];
  const response = new Response([
    JSON.stringify({ type: "stage", stage: "Finding real places" }),
    JSON.stringify({ type: "result", status: 200, data: { plans: [], nearby: { places: [] } } }),
    "",
  ].join("\n"), { headers: { "Content-Type": "application/x-ndjson" } });
  assert.deepEqual(await readPlanningResponse(response, (stage) => stages.push(stage)), { plans: [], nearby: { places: [] } });
  assert.deepEqual(stages, ["Finding real places"]);
});
