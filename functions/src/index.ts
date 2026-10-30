import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirebaseAdmin } from "../../lib/firebase/server";
import { generate } from "../../lib/server/actions/generate";
import { chat } from "../../lib/server/actions/chat";
import { customize } from "../../lib/server/actions/customize";
import { swap } from "../../lib/server/actions/swap";
import { restore } from "../../lib/server/actions/restore";
import { locate } from "../../lib/server/actions/location";
import { places } from "../../lib/server/actions/places";
import { invitations } from "../../lib/server/actions/invitations";
import { dateHistory } from "../../lib/server/actions/date-history";
import { conversation } from "../../lib/server/actions/conversation";
import { intake } from "../../lib/server/actions/intake";
const deepseek = defineSecret("DEEPSEEK_API_KEY");
const limiter = defineSecret("PLANNER_RATE_LIMIT_SECRET");
const maps = defineSecret("GOOGLE_MAPS_SERVER_KEY");
const actions = { generate, chat, customize, swap, restore, locate, places, invitations, dateHistory, conversation, intake };
export const datePlanner = onRequest({ region: "europe-west1", invoker: ["date-atlas-server@date-atlas-20261026.iam.gserviceaccount.com"], timeoutSeconds: 60, memory: "512MiB", maxInstances: 3,
  serviceAccount: "date-atlas-server@date-atlas-20261026.iam.gserviceaccount.com", secrets: [deepseek, limiter, maps],
}, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST required." }); return; }
  const action = req.query.action;
  if (typeof action !== "string" || !Object.hasOwn(actions, action)) { res.status(400).json({ error: "Unknown planning action." }); return; }
  if (process.env.REQUIRE_APP_CHECK === "true") {
    try { await getAppCheck(getFirebaseAdmin()).verifyToken(req.get("x-firebase-appcheck") || ""); }
    catch { res.status(401).json({ error: "App verification required." }); return; }
  }
  const headers = new Headers({ "Content-Type": "application/json", "x-atlas-client-ip": req.get("x-atlas-client-ip") || "unknown" });
  const token = req.get("x-atlas-user-token"); if (token) headers.set("authorization", token);
  const request = new Request("https://internal/planner", { method: "POST", headers, body: req.rawBody.toString("utf8") });
  const stream = action === "generate" && req.get("accept")?.includes("application/x-ndjson");
  if (stream) { res.setHeader("Content-Type", "application/x-ndjson"); res.setHeader("Cache-Control", "no-store, no-transform"); res.flushHeaders(); }
  const progress = (stage: string) => { if (stream && !res.destroyed) res.write(JSON.stringify({ type: "stage", stage }) + "\n"); };
  const response = action === "generate" ? await generate(request, progress) : await actions[action as keyof typeof actions](request);
  const result: unknown = await response.json();
  if (stream) { res.end(JSON.stringify({ type: "result", status: response.status, data: result }) + "\n"); }
  else res.status(response.status).json(result);
});
