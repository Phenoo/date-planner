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

## Remaining configuration and operating limits

Email/password, email-link and anonymous planning are enabled. Google sign-in was found disabled in production; its successful preview configuration does not enable the live provider. Google's live consent screen requires a support-email choice. The earlier address approval applied to preview only, so live Google configuration is awaiting the owner's answer to the separate question. The app's support contact remains blank as requested. Do not claim live Google sign-in has been tested or enabled until this is completed.

Payments, paid plans, subscriptions, partner commissions, paid concierge and unfulfilled manual reservations remain disabled/unimplemented. No live charge or booking confirmation is introduced by the release. Privacy/legal, physical-device and broader accessibility/reduced-motion review limitations from the completion report still apply; release approval is not a compliance certification.

## Rollback

Re-promote the previous production frontend and explicitly restore the public app alias to it. Restore the matching previous planner source/revision using the privately preserved function source/configuration if backend rollback is necessary. Review both halves together; do not weaken IAM or database rules. Additive indexes and schema defaults can remain. TTL deletion or deliberately processed account erasure cannot be undone by rolling back code; no blanket legacy backfill was run by this release.
