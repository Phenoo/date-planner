# Release completion — a date at las

This 30–31 October completion pass supplements the [initial audit](release-audit-2026-10-30.md). It is an incremental patch on `2b2b452593f7113e55cc9ab5c5fcf44071a40394`, prepared on `codex/release-completion`. The existing Next.js/Firebase/DeepSeek stack, design system, guest planning, one-place recommendation and red reveal are preserved. No production deployment, production record mutation, venue contact, invitation message or charge was made during this pass.

## Current audit

| Feature | Current evidence | Status / priority | Acceptance |
| --- | --- | --- | --- |
| Guest planning, chosen schedule, single pick | Existing engine and questionnaire retained; emulator guest generation and actual cloud anonymous generation | KEEP / P0 | One identifiable place; date, time and Africa/Lagos retained |
| Constraints and failed generation | Hard filters and coordinated request leases retained; emulator exclusions, invalid schedules, concurrent/replayed/failed generation | KEEP / P0 | No invented fallback or duplicate generation |
| Cinematic red reveal | Chrome real-provider reveal, keyboard Skip → same place, 360px width = content width, venue photo attribution and reviews | KEEP / P0 | Essential details remain reachable; no animation dependency added |
| AI story facts | A real-provider walkthrough exposed an unverified venue facility in prose; `selectedDateStory` now renders only approved moments chosen by DeepSeek | FIX / P0 | Regression rejects invented moment IDs and ignores unrestricted story text |
| Real Firebase sign-in | Separate preview project; Google sign-in completed in standalone Chrome; one authorized email-link message sent and recipient confirmed delivery | KEEP / P0 | Production auth untouched. Real email-link completion was not claimed from delivery alone |
| Save/auth return | Existing account-only, idempotent saves and pending-action recovery retained; emulator helper exercises one-use links, transfer failure/retry and URL cleanup | KEEP / P0 | Guest inputs stay private; after sign-in the intended action resumes |
| Legacy import/account switching | Disposable local fixture recreated the old browser format; UI explicitly imported/recalculated it; second emulator account had an empty collection | VERIFIED / P0 | No automatic assignment or cross-account display; imported legacy copy removed only after successful save |
| Plan management | `date-management.ts`, `date-actions.tsx`; Chrome private Save → My dates → Rename → Edit → revalidated schedule | ADDED / P1 | Venue preserved; native input changed day/time to 8 Nov, 15:00 Lagos; old links revoked on edit |
| Private/public separation | Explicit `publicStoredDateSchema`; emulator owner/stranger/direct-rule tests | KEEP / P0 | Full request and custom private title never enter public projection |
| Republish/revoke/delete | Owner-only transactions, source revalidation, opaque token rotation; emulator checks | ADDED / P1 | Old URL stops resolving; one owner cannot delete another owner's date |
| Recipient time proposal | Explicit POST, original time unchanged, pending response, creator review required | ADDED / P1 | Repeated identical proposal idempotent; conflicting/past proposal rejected; GET never accepts |
| Calendar | `calendar.ts`, token calendar route, private Blob download; actual Chrome `.ics` download inspected | ADDED / P1 | Edited Lagos 15:00 → UTC 14:00, three-hour duration, TENTATIVE status; no calendar-account permission |
| Feedback | Private owner-only record with `publishConsent:false`; emulator attendance gating; Chrome non-attendance feedback | ADDED / P1 | No enjoyment/cost claim without attendance; no automatic completed status or public review |
| External booking actions | Current venue website/directions links retained; website label made truthful | KEEP / P1 | No reservation inventory, confirmation, manual fulfillment or payment promise |
| Venue operations | Existing catalog lab and protected controls/reports retained | KEEP / P0 | Emulator proves ordinary accounts cannot disable/modify venues |
| Privacy requests | Profile → Manage account; protected lab deletion queue; emulator request/withdraw, access denial and complete erasure | ADDED / P0 | Processing immediately disables API/public invitation access; resumable batches; another admin processes own-account requests |
| Retention | Expiring context enforced at read, including timestamped legacy context; explicit-project dry-run backfill script | IMPROVED / P0 | Undated legacy records fail closed and require operator review; saved dates are not temporary context |
| Mobile/accessibility | Targeted Chrome at 360/390px, keyboard actions and bounded editor; earlier local dialog/focus checks retained | IMPROVE / P0 | Not a physical-device test, full contrast audit or accessibility certification |
| Paid features | No payment/reservation state introduced | KEEP DISABLED | Core recommendation, save and authenticated creator sharing stay free |

## Verification

- Unit tests: 111 passed, zero failed (baseline before this completion pass: 104).
- Expanded real Auth/Firestore emulator journey: passed. Covers authorization/rules, request coordination, private context, saved-plan ownership, invitation privacy/revocation, owner editing, alternate-time proposals, private feedback and resumable account erasure. Fictional provider responses are not live-provider evidence.
- Final typecheck, lint, Next build (39/39 prerender tasks), private-function bundle and diff whitespace checks: passed. No new dependency was added. Existing non-fatal emulator metadata warnings remain separate from failures.
- Independent cloud preview generation used real Google Geocoding/Places and DeepSeek. It returned one primary Google record, AI personalization, source ID/address/hours, and the requested 7 Nov 2026 14:00 Africa/Lagos schedule. Price/inventory uncertainty remained explicit. No approved catalog records were invented to fill the new preview database.
- Local frontend with that separate Firebase project: Chrome Google sign-in, conversational intake, one real recommendation, skip/accept, attributed loaded photo and reviews, private saving, renaming, schedule edit and calendar download. This is separate from the cloud HTTP test, not a claim that the entire protected cloud browser journey passed.
- In-app browser with emulators: explicit old-device import, removal of the legacy copy only after successful recalculation/save, owner → second-account switch with an empty second collection, private date view, and editor keyboard focus at 390px. The editor's save button scrolled into view at y=693–743 within the 844px viewport. New saved-date View works without publishing an invitation. Above-the-fold dashboard photography now loads eagerly following the observed Next image warning.
- Fictional invitation browser check: Chrome opened the public recipient page without a sign-in screen. The in-app browser deliberately proposed 8 Nov 15:00; the original 7 Nov 14:00 remained displayed and acceptance stayed pending, with a creator-review message replacing response controls. No invitation was sent to another person.
- Creator sharing fallback: the in-app browser's Copy link action put the expected local invitation URL on the clipboard and displayed success. The WhatsApp target contained the same encoded link; no message was sent. The native system share sheet and WhatsApp message delivery are not claimed as tested.
- The retention tool was also exercised against disposable emulator records: default dry run wrote nothing, explicit apply stamped the dated temporary fixture, undated records remained untouched for review, and a permanent saved-plan fixture did not acquire an expiry.
- The in-app browser completed the email send. Its Google popup did not complete through the automation surface; standalone Chrome did complete. Browser extensions produced a Grammarly hydration warning; no application suppression was added.

## Preview isolation

- Firebase: `adal-preview-20261030`, separate Firestore and Auth, free Spark plan, no billing upgrade. Google, email-link and anonymous providers configured. OAuth support address was specifically approved for this preview only; the app support/privacy contact remains blank at the owner's request.
- Vercel: separate `adal-preview` project `prj_zm2wT5HCBbl2uNyA8dOM7V6ORtSY`, Node 24. Preview environment uses preview-only server credentials and the existing real Maps/DeepSeek services. Production project/link is unchanged. Deployment Protection remains enabled.
- Use the unique preview deployment URL at handoff, which redirects unauthenticated requests to Vercel sign-in. A friendly alias was found to be public under the project's default protection scope and was removed (the alias now returns 404). Firebase's preview authorized domains were narrowed to the owned Firebase domains, localhost and the unique review deployment. No private data was made public; account and database authorization remained enforced.
- The first deployment of a new Vercel project was automatically assigned that new project's production target by the CLI; it had no production-target secrets. Verification uses a subsequent **preview-target** deployment. This did not touch the existing live app.
- Preview Firestore rules and indexes deployed successfully. Paid asynchronous TTL policies were deliberately omitted from the free preview; read-time expiry still applies. Production TTL/index rollout and cleanup remain controlled release operations.
- `DATE_ATLAS_FUNCTIONS_URL` is absent in preview, so the existing direct Next server handlers run against the preview database. The production private function is bundled/tested locally but not cloud-deployed by this pass.

## Data changes and operations

The new implementation is concentrated in `lib/server/date-management.ts`, `lib/server/account-privacy.ts`, `lib/server/context-retention.ts`, `lib/planner/calendar.ts`, `lib/planner/date-feedback.ts`, `components/date-atlas/date-actions.tsx`, `suggest-time.tsx`, `account-privacy.tsx` and `privacy-operations.tsx`, plus their existing history/invitation/profile/lab integrations. New routes are `/api/date-feedback`, `/api/account/privacy`, `/api/admin/privacy` and `/api/invitations/[token]/calendar`; existing date-history POST dispatch is extended. `firestore.indexes.json` adds the deletion queue query, receipt expiry and private history index exemptions. Tests extend the current emulator journey and add calendar/feedback/context coverage. No new dependency or destructive schema migration is introduced.

Additive private history fields: `planningRequest`, `customTitle`, `savedRecipeId`; public/owner schedule proposal: optional `suggestedTime`. Legacy records remain readable; records lacking their original constraints cannot be safely edited or republished. Public parsing omits all new private history fields. New private feedback lives at `users/{uid}/userFeedback/{dateId}`; feedback never grants attendance/completion status.

`accountDeletionRequests/{sha256(uid)}` contains the target UID only while pending/processing. The administrator must verify the request before processing. Start disables Firebase Auth, revokes tokens and blocks authenticated actions plus public invitation reads/replies. Wait ten minutes for existing operations, then continue batches until all public invitations, known flat private user subcollections, user document and Auth account are removed. Completion replaces the job with a minimal expiring receipt; it does not retain email or raw UID. Never simulate this with a real account during QA. New future nested collections must be added to the erasure review; current owned collections are flat.

| Records | Retention |
| --- | --- |
| Browser core drafts / private generated context | One hour; explicit reset; context expiry checked before access |
| Coordinated generation request cache | Ten minutes; no cached provider venue facts |
| Planner rate-limit records | One day |
| Funnel events / structured venue reports / deletion completion receipts | 30 days; asynchronous cleanup |
| Saved plans, date history and private feedback | Until owner deletion or processed account deletion |

For legacy cleanup, run `node scripts/backfill-retention.mjs --project EXPECTED_PROJECT` with the matching `FIREBASE_PROJECT_ID` and server credentials loaded through the normal environment mechanism. It defaults to **dry run**, emits aggregate counts only and scans at most 1,000 records per supported collection group. Review `undatedNeedsReview` and `scanLimitReached`; a limited scan is not a complete audit. `--limit` can raise the bound to 100,000. A separately reviewed `--apply` stamps deadlines only on unchanged dated temporary records missing expiry; enabled TTL may then permanently remove expired records. It never targets saved plans/date history, guesses dates for undated records or changes existing expiry policies. Preview dry run completed with zero changes.

Privacy copy now describes the actual request/feedback/retention flow. This is engineering functionality, not completed legal compliance. Official NDPC Act/FAQ document requests returned HTTP 403 during this pass, and the regional Act PDF returned 502. Controller identity/contact, lawful basis, rights-response procedures, retention exceptions, provider transfers and applicable Nigerian legal obligations still need business/legal review. No contact address was fabricated.

## Release and rollback

1. Review this branch and obtain explicit approval to release. Do not deploy live payments or add a new backend/provider.
2. Confirm existing production Firebase/Vercel identities and record the currently active deployment and function revision. Ensure the existing server identity has Firestore access and Firebase Auth administration for verified erasure operations. Do not broaden ordinary-user permissions.
3. Review/apply additive `firestore.indexes.json` indexes and expiry policies in the existing Firebase project; wait for required indexes. Review legacy cleanup in dry-run mode before any production write. Leave blanket-deny client rules intact.
4. Build and stage the compatible existing Firebase planner function (`npm run build:functions`), then stage the Next frontend with **production** configuration without assigning domains. Verify both together, including new history actions and calendar route. The function URL/identity must still refer to the production project; preview credentials must never be promoted into it.
5. After the release checks pass, assign the existing live aliases to the approved production build. Do not promote the isolated preview build with preview Firebase credentials into the live project.
6. Roll back the frontend and private planner function together if necessary. Keep additive indexes/defaulted fields and restrictive rules; do not restore deleted public links, downgrade data permissions or overwrite saved records. Account erasure and TTL removal cannot be undone by a code rollback, so review those operations independently.

Required variables remain in [.env.example](../.env.example): four public Firebase web identifiers; server `FIREBASE_PROJECT_ID` and Firebase credentials/ADC; server `DEEPSEEK_API_KEY`, optional model; `GOOGLE_MAPS_SERVER_KEY`; `PLANNER_RATE_LIMIT_SECRET`; existing private `DATE_ATLAS_FUNCTIONS_URL` in production. Optional restricted Embed key and App Check site key stay optional. No secret values belong in source, logs or this report. No Paystack key, by itself, enables a checkout implementation.

Still not claimed: physical-device/Safari/Firefox verification, a complete accessibility/contrast audit, browser reduced-motion equivalence where the available browser controls cannot emulate it, real email-link redemption/account-switching across real accounts, production private-function failover/load testing, live reservation inventory, actual bookings/payments or legal certification. Safe local checks and remaining release gates are documented separately from completed behavior.

P2 remains unimplemented: subscriptions, rewards/social feed, in-app messaging, large partner dashboards, broad expansion, complex booking providers, sponsored ranking and advanced recommendation ML. Premium checkout, partner commissions and paid concierge remain disabled.

References: [Firebase user administration](https://firebase.google.com/docs/auth/admin/manage-users), [session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions), [iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), [W3C focus-visible guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [NDPC Act download](https://ndpc.gov.ng/download/nigeria-data-protection-act-2023).
