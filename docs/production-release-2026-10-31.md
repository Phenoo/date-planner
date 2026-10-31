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
