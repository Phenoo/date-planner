# Production release — 1 November 2026

The owner explicitly approved deploying the custom chat-time fix. The application is live at [date-atlas.vercel.app](https://date-atlas.vercel.app).

## Released versions

| Component | Before | Released |
| --- | --- | --- |
| Application source | `a755519` | `2867fd0ab25468d000f7df22428e4a8acc212918` |
| Vercel frontend | `dpl_GFhjtPPzFJ2gDTmeKQvHEoGG8QV7` | `dpl_xZddLaU2wdKeBnmxcdKBDk8S3CNe`, READY |
| Private Firebase planner | `dateplanner-00024-zor` | `dateplanner-00025-ciq`, ACTIVE |

The deployed frontend is `date-atlas-bsmdv3g49-logicleads-projects.vercel.app`. Both the primary app address and the default project alias were verified against this deployment and application commit. Source was pushed to the existing GitHub repository's `main` branch. Production uses the existing Vercel project, Next.js 16.4.3 / Node 24 frontend and Firebase Node 22 planner.

## Change

Chat now includes a native time picker with minute precision, alongside the existing suggested times and text composer. Selecting a time or typing an unambiguous exact clock reply uses validated server handling before the AI provider call. Exact minutes and the venue timezone are preserved, other answers remain intact, and past selections receive a clear correction prompt. Editing a time avoids unnecessarily focusing the chat keyboard.

No dependency, environment-variable, schema, database-rule, index or retention change was needed. Guest planning, one primary recommendation, registered-only saving/sharing and the existing design remain in place. Payments and paid services remain disabled.

## Verification and rollout

- All 127 unit tests passed again before release. Typecheck, lint, both local builds and the Auth/Firestore emulator regression suite passed in the implementation pass. The integration suite verifies that an exact `19:45` selection succeeds without an AI API key and preserves the other preferences.
- Local in-app-browser checks covered typed `19:45`, picker selection of `20:17`, editing, refresh retention and 360px/390px layouts. These were emulator/browser-viewport checks, not physical-device or production mutation tests.
- The private backend was deployed first. The production frontend build passed TypeScript and generated all 40 pages; its build completed in 15 seconds. The same staged build was promoted, with the primary public alias explicitly assigned after staging checks. The CLI also assigned the default project alias during staging despite `--skip-domain`, as in preceding releases.
- Ten read-only smoke checks passed on the staged production deployment and again on the public address: privacy, catalog, country and country-city lookup; unauthenticated private account routes; past-date generation, malformed history input and malformed planner-intake input. The public homepage was also checked without a deployment-protection credential.
- No production test account, generated plan, invitation, chat message, reservation or payment was created. Exact-time behavior was exercised locally; the live checks verify deployment identity and request boundaries without creating business records.
- The planner is ACTIVE with no public IAM invoker. Google sign-in remains enabled, all five composite indexes are READY and all seven expiry policies are ACTIVE. A bounded runtime error/fatal query for this deployment returned no matching errors after the live checks. No external log drains are configured; this is an initial scan, not continuous monitoring.

## Rollback

Re-promote `date-atlas-pummcasy9-logicleads-projects.vercel.app` and explicitly restore `date-atlas.vercel.app` to it. If backend rollback is necessary, restore the matching `dateplanner-00024-zor` source/configuration preserved privately before deployment. No user-data migration or backfill needs reversal. Existing saved date/time values remain compatible.
