import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
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
import { discoverPlaces } from "../../lib/server/actions/discover-places";
import { dateReminders } from "../../lib/server/actions/date-reminders";
import { dispatchDueDateReminders, reconcileDateReminder } from "../../lib/server/date-reminders";
import { invitations } from "../../lib/server/actions/invitations";
import { dateHistory } from "../../lib/server/actions/date-history";
import { sharedWishlist } from "../../lib/server/actions/shared-wishlist";
import { conversation } from "../../lib/server/actions/conversation";
import { intake } from "../../lib/server/actions/intake";
import { sendDateCreatedEmail } from "../../lib/server/date-created-email";
const deepseek = defineSecret("DEEPSEEK_API_KEY");
const limiter = defineSecret("PLANNER_RATE_LIMIT_SECRET");
const maps = defineSecret("GOOGLE_MAPS_SERVER_KEY");
const resend = defineSecret("RESEND_API_KEY");
export const dateCreatedEmail = onDocumentCreated({
  document: "users/{ownerId}/emailNotifications/{dateId}",
  region: "europe-west1", memory: "256MiB", timeoutSeconds: 60, maxInstances: 2, concurrency: 4,
  serviceAccount: "date-atlas-server@date-atlas-20261026.iam.gserviceaccount.com",
  secrets: [resend, maps], retry: true,
}, async event => {
  if (event.data) await sendDateCreatedEmail(event.params.ownerId, event.params.dateId);
});
export const dateReminderSchedule = onSchedule({
  schedule: "every 5 minutes", timeZone: "UTC", region: "europe-west1", timeoutSeconds: 60, memory: "256MiB", maxInstances: 1,
  serviceAccount: "date-atlas-server@date-atlas-20261026.iam.gserviceaccount.com",
}, async () => { await dispatchDueDateReminders(); });
export const dateReminderChanged = onDocumentWritten({
  document: "users/{ownerId}/dateHistory/{dateId}", region: "europe-west1", timeoutSeconds: 60, memory: "256MiB", maxInstances: 2,
  serviceAccount: "date-atlas-server@date-atlas-20261026.iam.gserviceaccount.com", retry: true,
}, async event => { await reconcileDateReminder(event.params.ownerId, event.params.dateId); });
const actions = { generate, chat, customize, swap, restore, locate, places, discoverPlaces, dateReminders, invitations, dateHistory, sharedWishlist, conversation, intake };
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
  const requestKey = req.get("idempotency-key"); if (requestKey) headers.set("idempotency-key", requestKey);
  const request = new Request("https://internal/planner", { method: "POST", headers, body: req.rawBody.toString("utf8") });
  const stream = action === "generate" && req.get("accept")?.includes("application/x-ndjson");
  if (stream) { res.setHeader("Content-Type", "application/x-ndjson"); res.setHeader("Cache-Control", "no-store, no-transform"); res.flushHeaders(); }
  const progress = (stage: string) => { if (stream && !res.destroyed) res.write(JSON.stringify({ type: "stage", stage }) + "\n"); };
  const response = action === "generate" ? await generate(request, progress) : await actions[action as keyof typeof actions](request);
  const result: unknown = await response.json();
  if (stream) { res.end(JSON.stringify({ type: "result", status: response.status, data: result }) + "\n"); }
  else res.status(response.status).json(result);
});
