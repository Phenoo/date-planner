# date-planner

**a date at las (adal)** is a mobile-first Next.js date planner using TypeScript, Firebase Authentication, Cloud Firestore, DeepSeek, and Google Maps. The Typeform-style planner works without registration. Users choose weekday or weekend, can leave the time open, and receive at most three real place recommendations with suggested date stories. Picking a place creates an invitation with an explicit accept/decline flow. Registered accounts keep planned and completed dates in private history.

## Run

Use Node.js 24.12 or later in the Node 24 LTS line (`nvm use`).

```sh
npm install
cp .env.example .env.local # only for a fresh checkout; preserve existing credentials
npm run dev
```

The current project is `date-atlas-20261026`. Its web app, Firestore database in `europe-west1`, email-link authentication, Maps Embed key, security rules, and indexes have been provisioned. The local `.env.local` contains credentials and must never be committed.

## Firebase

The browser uses the four `NEXT_PUBLIC_FIREBASE_*` values. These identify the Firebase web app; they do not grant database access. Add each production domain to Firebase Authentication's authorized domains. Email sign-in sends a link; opening it on another device asks for the same email before completing sign-in.

Server routes use `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. The private key accepts escaped newlines. Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`) can replace the email/private-key pair. Never expose server credentials through a `NEXT_PUBLIC_` variable.

The scoped `jwks-rsa` → `jose` override keeps Firebase Admin 14 compatible with Vercel's CommonJS loader. The runtime regression test checks SDK loading and signing-key conversion with native `require(ESM)` disabled. Keep the override until the [upstream compatibility issue](https://github.com/firebase/firebase-admin-node/issues/3181) is resolved and that test passes without it.

Collections:

- `experiences/{id}`: validated `record`, active/approved/demo query fields, update metadata. Real recommendations require active, approved, non-demo records with a source URL and price-verification date.
- `experiences/{id}/priceHistory`: price changes written atomically with catalog updates.
- `users/{uid}/savedPlans/{hash}`: private recipes; each API operation derives the owner from a verified Firebase ID token. IDs are hashed to prevent document path injection.
- `users/{uid}`: account save timestamp.
- `plannerLimits/{hash}`: transactional request counters with expiry, using an HMAC rather than storing raw IP addresses.

Direct browser database reads and writes are denied, including for signed-in users. All operations go through server routes that verify tokens and trusted `admin: true` custom claims. The Admin SDK uses IAM, so Firestore rules do not replace server authorization. Do not put admin privileges in user-editable profile data.

```sh
firebase deploy --only firestore:rules,firestore:indexes
```

After the intended administrator signs in once, grant the trusted claim from a secure terminal:

```sh
npm run admin:grant -- administrator@example.com
# To revoke: npm run admin:grant -- administrator@example.com --revoke
```

Sign out and back in to refresh the token. The `/admin` page can inspect the catalog, edit records, and test recommendation decisions. The web server's service account has database and authentication access, not project ownership. For deployment, provision server credentials securely in the hosting environment.

Legacy Supabase migrations remain in `supabase/` for historical reference; the runtime now uses Firebase and does not require Supabase.

## Live experiences

Live mode is the default. **The new database has no curated real experiences yet.** A valid request therefore returns an honest empty result. There is no automatic fallback to fictional records when the database is empty or unreachable.

Add legally sourced, verified records through the authenticated catalog editor. Confirm prices, hours, coordinates, access/dietary information, and booking links before approval. Google Maps alone does not establish menu prices, accessibility, availability, or reservations. The recommendation engine only schedules approved catalog experiences and never lets AI invent places or costs.

For an explicit development demonstration, set `DATE_ATLAS_CATALOG_MODE=demo`. The 16 fictional fixtures, sample prices, and schematic locations are labeled and cannot produce real-world booking or directions links. Reopening saved plans recalculates them against the current catalog, so old demo saves cannot become real itineraries.

## DeepSeek

Set server-only `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` (currently `deepseek-flash`). The direct provider uses the AI SDK's structured output with Zod validation. DeepSeek forms activity-type searches from the full preference set, ranks real Google Places records down to three or fewer, and writes suggested date stories. Candidate IDs and preference explanations are validated against server-supplied records. Flexible weekday/weekend requests do not turn into invented calendar dates or schedules. The deterministic catalog engine still controls any explicitly scheduled catalog itinerary, including costs and spending limits.

Budget increases need an explicit amount in the user's message. Dietary additions preserve existing restrictions. Invalid output, provider errors, or timeouts use the supported command parser and template introductions. Personal notes are processed only when relevant to the request; they are not included in public share links.

Keep `PLANNER_RATE_LIMIT_SECRET` random and server-only. Live generation and assistant endpoints share a Firestore-backed limit of 12 requests per minute per client. Client IPs use Vercel's overwritten forwarding header. Other deployment hosts need a trusted-proxy adapter; local development shares one counter. This request limit is not a monetary spending cap—configure provider billing limits before public launch.

Keep provider credentials in the local environment and deployment secret settings, and rotate any exposed key without committing its value.

## Maps

`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` is a public key restricted to the Maps Embed API and permitted website referrers. The current restrictions cover localhost and the project's Firebase domains; add your deployment domain before publishing.

`GOOGLE_MAPS_SERVER_KEY` stays server-side and is restricted to Geocoding API and Places API (New). `/api/location` resolves a permission-based browser location to an area without saving precise coordinates. `/api/places` retrieves live nearby listings, filtered by distance and relevant activity types. Neither endpoint stores Google place details. Nearby suggestions show Google Maps attribution and links; unknown prices, opening hours and access requirements are not represented as confirmed. Budgeted itineraries still require approved, priced catalog experiences. Server geocoding also supplies the origin used by generation, swaps, edits and saved-plan recalculation. Location and nearby-place lookups use the same private Firebase function as the planner when `DATE_ATLAS_FUNCTIONS_URL` is configured, so a local Firestore connection does not block them. Browser location errors are distinguished from area-lookup errors; the client cancels a stalled area lookup after 18 seconds.

The planner offers an optional area preview. Real itinerary stops display Google Maps and ordered directions, including walking mode. Fictional stops retain a labeled schematic. Map routes do not recalculate itinerary durations: all itinerary travel and transport costs remain labeled estimates without live traffic. Places autocomplete and traffic-aware scheduling remain separate follow-up work; enabling their Google APIs does not activate them in the app.

## Checks

For the invitation/history integration check, start Firebase Auth and Firestore emulators with project `demo-date-atlas`, then run `npm run test:journey`. It checks real emulator authentication, ownership, idempotent selection and replies, guest/account transfer, completion, and filtered pagination. Provider place details are clearly labeled test fixtures. The runner refuses cloud databases and writes a disposable local emulator login under `.vercel/` for optional browser verification. Emulator browser sign-in is supported only for `demo-` projects on localhost when `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` is explicitly set; never set emulator variables in a deployment.

Invitations and history store Google place IDs and the suggested story/timing, not a copied venue directory or private planning notes. Details are fetched from Google when displayed. Public invitation responses expose no owner UID, budget, dietary requirements, notes, or starting location. History is account-scoped; marking a date as done is explicit. Guest selections transfer when an account is linked or an authenticated guest session is merged. Deploy `firestore.indexes.json` for the planned/completed history filters.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:firebase
```

The Firebase check uses configured credentials and a running local server. It creates disposable test users and recipes, checks account isolation and denied access, then removes its own test data. It never sends emails. Run it against a staging project when production has users.

To verify the fictional planning journey separately, start a development server with `DATE_ATLAS_CATALOG_MODE=demo`, then run `node scripts/check-planner-api.mjs`. The old `test:db` script tests the legacy PostgreSQL migration, not the active Firestore database.

## Scope

The app uses a red-and-white palette and DM Sans throughout. Its first visit opens with animated, textured red typography and a swipe/tap-to-start control, followed by the three date previews. Partial swipes reset, Enter/Space can activate the control, and reduced-motion preferences are respected. The introduction waits for the user and can be replayed from the footer. The one-question-at-a-time form, optional sign-in, and signed-in-only mobile navigation are preserved. Itineraries support swaps, locks, reorder, removal, regeneration, strict budgets, local/cloud saves, and privacy-reduced sharing. Preferences and favorites remain device-local.

Verified venue curation, live booking inventory, Paystack payments, vendor acceptance, confirmation emails, and traffic-aware scheduling are not active. No bookings or testimonials are fabricated. Photos are illustrative; provenance is in `public/images/SOURCES.md`.
