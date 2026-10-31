# Production release — 31 October 2026

The owner explicitly approved publishing the completed changes to production. The application is live at [date-atlas.vercel.app](https://date-atlas.vercel.app).

## Released versions

| Component | Before | Released |
| --- | --- | --- |
| Vercel frontend | `dpl_Afu6jxYN8DE3QzdygfuGdueBrgqA` | `dpl_A61THMS1vDNeV49kQ31XoKJyrzU4` |
| Frontend source | `2b2b452` | `e33dcab` (application changes through `e442225`) |
| Firebase planner | `dateplanner-00021-caj` | `dateplanner-00022-buj`, ACTIVE |
| Firebase project | `date-atlas-20261026` | Preserved |
| Public aliases | Existing app aliases | Both app aliases point to the released frontend |

The frontend was built with the existing **production** configuration and staged without moving domains. The compatible private function and database configuration were deployed first. The staged build was checked, promoted, and assigned to the public app alias. The isolated preview project and its credentials were not promoted into production.

All five composite indexes are READY. All seven declared expiry policies are ACTIVE, including the existing rate-limit policy. Client Firestore rules remain blanket-deny; server routes enforce Firebase authentication, ownership and administrator claims. The function retains the existing server identity and has no public IAM invoker. No user data, saved dates or invitation links were deleted or backfilled as part of this deployment.

The Firebase function update completed successfully. The CLI then required an image cleanup policy; this was resolved by configuring the existing function artifact repository to retain container images for 30 days. This policy concerns build images, not user records. Previous function source and deployment configuration were preserved privately for rollback.

## Verification actually performed

- 111 unit tests passed again before release; private function bundle passed. The production Next build passed its TypeScript check and 39 prerender tasks.
- Seven read-only checks passed against the staged production build and again against the public app: privacy content and catalog returned 200; saved-plan, feedback and privacy-account routes rejected unauthenticated access with 401; a past-date generation request and malformed history action returned 400.
- The past-date check traversed the existing Vercel-to-private-function gateway and exited before generation or database mutation. No test account, generated date, real invitation, reservation, message or payment was created in production.
- The live homepage was inspected in the in-app browser. This is a homepage/read-only smoke check, not a complete production authentication/planning mutation test. The preceding isolated preview/emulator checks remain documented in the [completion report](release-completion-2026-10-30.md).
- A production retention **dry run** found 18 older discovery-session records lacking expiry. It made zero changes. No legacy expiry backfill was applied; these records require separate operator review. Permanent saved plans/date history are excluded from the temporary-context policy.
- After the owner's explicit approval, Google sign-in was enabled in the production Firebase project. The console shows Google as Enabled, and a separate read-only Identity Platform check confirms the provider is enabled and both live app domains remain authorized. No production sign-in or test-account creation was performed.

## Remaining configuration and operating limits

Email/password, email-link, anonymous planning and Google sign-in are enabled. Google's live consent configuration uses the owner-approved support address and the public-facing name **a date at las**. The app's support contact remains blank as requested. This provider configuration change takes effect without a frontend redeployment. Configuration was verified; a complete live Google sign-in journey was not tested because production test-account creation was excluded from this release's verification.

Payments, paid plans, subscriptions, partner commissions, paid concierge and unfulfilled manual reservations remain disabled/unimplemented. No live charge or booking confirmation is introduced by the release. Privacy/legal, physical-device and broader accessibility/reduced-motion review limitations from the completion report still apply; release approval is not a compliance certification.

## Rollback

Re-promote the previous production frontend and explicitly restore the public app alias to it. Restore the matching previous planner source/revision using the privately preserved function source/configuration if backend rollback is necessary. Review both halves together; do not weaken IAM or database rules. Additive indexes and schema defaults can remain. TTL deletion or deliberately processed account erasure cannot be undone by rolling back code; no blanket legacy backfill was run by this release.

## Subsequent chat and reveal release

The owner separately approved publishing the chat and reveal improvements on 31 October. Application source is `29a326e95416701f735e62e4f149c7f02ab42486`.

| Component | Immediately before this update | Released |
| --- | --- | --- |
| Vercel frontend | `dpl_A61THMS1vDNeV49kQ31XoKJyrzU4` | `dpl_9gEBJfcyfM7cTW9PSos7mMXjZnTB` |
| Firebase planner | `dateplanner-00022-buj` | `dateplanner-00023-guy`, ACTIVE |

The planning-interface switch is removed after the initial choice. Chat now uses a viewport-sized conversation with a growing composer, compact preference review and independent message scrolling. Before the existing slideshow, a recommendation-ready scene announces the result. Its button starts a short synthesized drum roll, with mute, skip, reduced-motion behavior and cleanup when leaving the screen. A tab-local, one-hour marker avoids replaying that introduction for the same place and schedule. Restoring a catalog plan now waits for Firebase's initial authentication state before checking account ownership, preventing a valid guest restore from being discarded during startup.

The production build compiled successfully, passed TypeScript and generated all 39 pages. The 113 unit tests passed again immediately before deployment; lint, local build and private-function bundling also passed in the preceding implementation pass. Local in-app-browser testing used Auth/Firestore emulators and a demonstration catalog, with a real DeepSeek intake response. It covered a message containing all required preferences, the reveal transition, mute, skipping during the animation, refresh recovery, both planning interfaces, themes and representative 360/390px layouts. A short-viewport composer check was performed; this does not claim physical-device keyboard or audible-device testing.

Seven read-only smoke checks passed on the new production build and again on the public alias. The live planner entry was inspected without choosing a planning mode, since mode selection records a funnel event and creates a guest session. No production test account, plan, invitation, message, reservation or payment was created. The Google provider remains enabled, existing domains remain authorized, and the updated planner function has no public IAM invoker. Database rules, indexes, retention configuration, billing and paid services were unchanged.

The installed Vercel CLI assigned the default project alias during the build despite `--skip-domain`. The primary `date-atlas.vercel.app` alias was explicitly moved after the backend update and build checks. Both public aliases were subsequently verified against `dpl_9gEBJfcyfM7cTW9PSos7mMXjZnTB`. A bounded runtime query for error/fatal logs on that deployment returned zero records after the live checks. No external log drains are configured; this is an initial error scan, not continuous monitoring or a full production mutation test.

For this update's rollback, re-promote `date-atlas-mrr6vkkv0-logicleads-projects.vercel.app` and explicitly assign `date-atlas.vercel.app` to it. If backend rollback is needed, restore the matching `dateplanner-00022-buj` source/configuration preserved privately before this update. No database migration or user-data rollback is required for these changes. Payments remain disabled.

## Subsequent planning simplicity and location release

The owner explicitly approved this production update. Application source is `a755519b5b0775349445cfc2acc1a04af3cab6fd`, pushed to the existing GitHub repository's `main` branch.

| Component | Immediately before this update | Released |
| --- | --- | --- |
| Vercel frontend | `dpl_9gEBJfcyfM7cTW9PSos7mMXjZnTB` | `dpl_GFhjtPPzFJ2gDTmeKQvHEoGG8QV7`, READY |
| Firebase planner | `dateplanner-00023-guy` | `dateplanner-00024-zor`, ACTIVE |
| Frontend build | Previous production source | Next.js 16.4.3, Node 24; build completed in 55 seconds |

The production deployment is `date-atlas-pummcasy9-logicleads-projects.vercel.app`. Both `date-atlas.vercel.app` and the default project alias point to this deployment. The existing design, one primary recommendation, guest planning and registered-only saving/sharing remain in place.

The release remembers the selected planning style, resumes current unfinished drafts directly from the homepage, exposes editable chat detail chips, and shortens the cinematic reveal to three chapters while retaining its opening drum roll and skip. Country detection uses Vercel's network country header without GPS permission, returning only a country with private, no-store caching. Manual country/city selection uses the existing GeoNames dataset, optional device-distance sorting and at most three suggestions. The country field is tucked behind a compact Change control. Explicit occasion quick replies reliably advance even if the AI omits the preference patch.

An optional, length-limited invitation note is deliberately public to link recipients. Only the authenticated creator can change it. It is not placed in browser drafts or generic social metadata. Private history and the active public projection update together; a note cannot publish a private plan or resurrect a revoked link. Notes survive renewed links and can be removed. The existing share areas and saved-date details include a recipient preview. Schema changes are additive and optional; no database migration, new index, new dependency or environment variable was required.

### Verification and rollout

- All 124 unit tests passed again immediately before release. Typecheck, lint, the 40-page frontend build, private-function build, and the local Auth/Firestore emulator regression suite passed in the implementation pass. The production build also passed its TypeScript check and generated all 40 pages.
- Local browser checks covered remembered planning style, draft recovery, chat budget edits preserving other answers, 360px/390px layouts, white/dark chip contrast, three reveal chapters and skip, manual country correction, invitation-note saving and recipient display. These were local/emulator checks, not physical-device or complete production mutation tests.
- Nine read-only smoke checks passed on the staged production build and again on the live alias: privacy, catalog, country and Ghana city lookup returned 200; private saved-plan, feedback and privacy routes rejected unauthenticated access; past-date generation and malformed history input returned 400. The country response was separately checked for private, no-store caching and a country-only payload.
- The live homepage and planner entry were inspected in the in-app browser without selecting a planning mode. No production test account, generated plan, invitation, message, reservation or payment was created. Invitation-note authorization, isolation, idempotency, revocation, removal and retained timing were exercised against local emulators.
- The compatible private backend was updated first. The frontend used the existing production project configuration. The CLI again assigned the default project alias despite `--skip-domain`; the primary public alias was explicitly moved after the staged checks. Both aliases were subsequently verified against the released deployment ID and source commit.
- The planner function has no public IAM invoker. Google sign-in remains enabled; all five composite indexes remain READY and all seven expiry policies ACTIVE. Deployment protection, database rules, credentials, billing and paid services were unchanged. A bounded error/fatal runtime query for the new deployment returned no matching errors after the live checks. No external log drains are configured; this is an initial scan rather than continuous monitoring.

### Rollback for this update

Re-promote `date-atlas-y4hu9xv2l-logicleads-projects.vercel.app` and explicitly restore `date-atlas.vercel.app` to that deployment. If backend rollback is necessary, restore the matching `dateplanner-00023-guy` source and configuration preserved privately before this rollout. Existing records need no rollback or backfill; the optional invitation message can remain in stored records. Rolling back the frontend hides the note editor without exposing private plan fields. Payments, subscriptions, commissions and paid concierge remain disabled.
