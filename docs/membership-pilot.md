# Subscription pilot

This branch implements a **test-only monthly subscription pilot** for A Date At las. It has not been deployed to `adateatlas.com`. No live keys or live billing are supported by the pilot configuration.

## Included

- Free: one successful new recommendation per UTC calendar month.
- Plus: one recurring date-night schedule, with weekly, biweekly, or monthly ideas. New recommendations and venue changes have no monthly cap for Plus; ordinary request throttling still applies.
- Nigeria billing country: Paystack test checkout, NGN 5,000 monthly (500,000 kobo).
- Other billing countries: Polar sandbox checkout, USD 5 monthly (500 cents), with applicable taxes displayed by Polar.
- Server verification of the configured monthly price, payment, owner, subscription and paid period. A return URL or `active` provider status alone never grants Plus.
- Authenticated membership summary, hosted checkout, billing portal and cancellation. Canceling renewal retains access through the verified paid period. Saved dates, invitations and ordinary reminders remain available.
- Signed webhook handling, verified renewals, full-refund revocation and stale-update fencing. Polar payment proof supports both tax-inclusive and tax-exclusive fixed prices, with no discounts or balance substitutions.
- Atomic allowance reservations, failure release, persistent consumption receipts and guest-to-account usage transfer. Browser retries retain a digest and request ID, without copying personal notes into storage.
- Ownership checks on legacy editing, restoration, saved-plan and invitation paths so they cannot manufacture a replacement outside the allowance.

Shared wishlists and Plan Together invitations are available independently of Plus. Plus can use places from the account’s shared wishlist as the starting point for its recurring suggestions.

### Recurring date nights

Membership lets the subscriber set a city, optional neighborhood and budget for two, vibe, cadence, and local day and time. The worker looks for an idea about two days ahead and checks wishlist places before searching nearby. The owner reviews the idea in the planner and chooses when to share it using Plan Together.

For the hosted pilot, apply the two collection-group indexes in `firestore.indexes.json` to the preview Firebase project. Set `CRON_SECRET` in the Vercel Preview environment and schedule an authenticated POST to `/api/membership/recurring/dispatch` every five minutes. Use the Vercel preview with membership test mode enabled. Set `RESEND_API_KEY` for the optional notification to the owner’s verified address. When mail is unavailable, prepared ideas still appear in Membership. The delivery worker checks current Plus access and schedule before sending.

## Configuration

`DATE_ATLAS_BILLING_MODE` defaults to off. Test mode additionally requires the isolated Firebase project `adal-preview-20261030`, or `demo-date-atlas` with a Firestore emulator. Production Vercel deployments and a configured remote planner proxy are rejected. All flags must agree; setting a browser flag cannot bypass server enforcement.

| Variable | Value |
| --- | --- |
| `DATE_ATLAS_BILLING_MODE` | `test` |
| `NEXT_PUBLIC_DATE_ATLAS_MEMBERSHIP_TEST` | `1` at build time |
| `DATE_ATLAS_BILLING_ORIGIN` | Trusted test site origin, e.g. `https://adal-membership-test.vercel.app` |
| `PAYSTACK_SECRET_KEY` | Test secret starting `sk_test_` |
| `PAYSTACK_PLUS_MONTHLY_PLAN` | Test monthly NGN 5,000 plan code |
| `PAYSTACK_WEBHOOK_SECRET` | Current Paystack test signing secret (`whsec_...`) |
| `POLAR_ACCESS_TOKEN` | Token from a Polar sandbox organization |
| `POLAR_PLUS_MONTHLY_PRODUCT` | Sandbox USD 5 monthly product, one fixed price, no trial |
| `POLAR_WEBHOOK_SECRET` | Sandbox endpoint signing secret |

Store secrets in the ignored `.env.subscription-test.local` for local testing, or **adal-preview → Preview** environment variables for staging. Do not place them in `NEXT_PUBLIC_` fields or chat. New Vercel environment values require a fresh Preview deployment; a previously built deployment does not acquire them automatically.

### Webhooks

- Paystack test URL: `https://adal-membership-test.vercel.app/api/membership/webhooks/paystack`
- Polar sandbox URL: `https://adal-membership-test.vercel.app/api/membership/webhooks/polar`

Paystack: enable `charge.success`, `invoice.update`, `invoice.payment_failed`, `subscription.not_renew`, `subscription.disable`, and `refund.processed`.

Polar: enable subscription lifecycle events, `order.paid`, and `order.refunded`.

Both handlers verify the original request bytes. Paystack uses timestamped HMAC SHA512 signatures when its signing secret is configured; legacy verification is accepted only when the new secret is absent. Polar uses the official SDK verifier. Invalid signatures return 401; provider failures return an error for redelivery. Neither handler acknowledges a payment before the corresponding database write completes.

The test deployment has a deliberate, explicitly approved public access exception so providers can reach these endpoints. This exception does not change production or the project-wide protection policy. Verify access again after replacing the deployment behind the test alias.

## Local testing

Start Firebase Auth and Firestore emulators for `demo-date-atlas` on ports 9099 and 8080, then run:

```sh
npm run dev:membership
```

Open `http://localhost:3005/membership`. This command forces emulator identities and storage, disables production mail/analytics/AI/Maps credentials and uses fictional demo venues. Demo recommendations are not billed; the separate transaction tests exercise allowance enforcement through the real generation coordinator with controlled fixtures.

```sh
npm test
npm run typecheck
npm run lint
npm run test:membership
npm run build:functions
```

`test:membership` requires the emulators. It uses real emulator identities and Firestore transactions with intercepted provider HTTP responses, never real cards or live provider accounts. It cleans its randomly named billing fixtures. The older full journey suite assumes an otherwise fresh emulator dataset for its global metrics assertions; rerunning it on accumulated fixtures produces unrelated counts.

## Test status and remaining work

The unit suite, TypeScript, ESLint, Functions packaging, Preview build, allowance integration and billing integration checks have passed. Public unsigned POSTs reach both webhook handlers and return application 401 responses.

All six provider variables are now configured in **adal-preview → Preview**; API tokens and signing secrets use Vercel Secret storage. Both real provider accounts passed monthly-price checks. A matching Paystack test plan was created after the original plan field contained a dashboard URL.

Real Paystack test checkout activated the original Plus pilot. Its renewal was then canceled and paid-period access remained available. Paystack's official endpoint ping and Polar's harmless product-event redelivery both returned verified HTTP 200 deliveries.

**Polar's paid journey is still pending:** its sandbox checkout opened and the explicitly approved test-card submission entered processing. Subsequent provider reads failed with `PolarNetworkError`; no paid order or activated Polar membership has been established. Reconcile that existing attempt before submitting another payment. A reserved example-domain test email was rejected by Polar; a business-mailbox test alias was accepted. Explicit provider validation rejections now release their checkout claim, while ambiguous network or response failures retain it.

Actual scheduled sandbox renewal and the complete Polar paid journey still need verification before considering a paid launch. No live charge, live key or production deployment is introduced by this pilot.

The first pilot deliberately prevents opening another subscription while any existing subscription is linked, including an expired one; account management stays with its original provider. Fully expired subscriptions that cannot be restarted in that provider's portal need a reviewed resubscription flow before a public paid launch. Ambiguous checkout initialization failures retain their reference to prevent duplicate recurring charges; an operator must reconcile an unresolved checkout before clearing it. No automatic retry creates another provider subscription.

Financial disputes and chargebacks need an explicit reconciliation policy before live billing. The current test pilot processes confirmed full refunds and disables renewals before account deletion; it is not a certification of live operational readiness.

## Official integration references

- [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Paystack payment verification](https://paystack.com/docs/payments/verify-payments/)
- [Paystack webhook signatures](https://paystack.com/docs/payments/webhooks/)
- [Polar TypeScript SDK](https://polar.sh/docs/integrate/sdk/typescript)
- [Polar sandbox](https://polar.sh/docs/integrate/sandbox)
- [Polar webhook delivery](https://polar.sh/docs/integrate/webhooks/delivery)
