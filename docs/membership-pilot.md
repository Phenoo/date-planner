# Subscription pilot

This branch implements a **test-only monthly subscription pilot** for A Date At las. It has not been deployed to `adateatlas.com`. No live keys or live billing are supported by the pilot configuration.

## Included

- Free: one successful new recommendation per UTC calendar month.
- Plus: four successful new recommendations and two venue changes per paid monthly period.
- Nigeria billing country: Paystack test checkout, NGN 5,000 monthly (500,000 kobo).
- Other billing countries: Polar sandbox checkout, USD 5 monthly (500 cents), with applicable taxes displayed by Polar.
- Server verification of the configured monthly price, payment, owner, subscription and paid period. A return URL or `active` provider status alone never grants Plus.
- Authenticated membership summary, hosted checkout, billing portal and cancellation. Canceling renewal retains access through the verified paid period. Saved dates, invitations and ordinary reminders remain available.
- Signed webhook handling, verified renewals, full-refund revocation and stale-update fencing.
- Atomic allowance reservations, failure release, persistent consumption receipts and guest-to-account usage transfer. Browser retries retain a digest and request ID, without copying personal notes into storage.
- Ownership checks on legacy editing, restoration, saved-plan and invitation paths so they cannot manufacture a replacement outside the allowance.

Annual billing, partner sharing, a shared wishlist, extra personalization and habit reminders are **not sold or advertised** by this version. They remain follow-up product work.

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

**Hosted provider checkout, actual provider webhook redelivery and real sandbox renewal have not yet been verified:** the local credential fields remained empty when checked, and the staging variable list did not contain Paystack or Polar configuration. Configure the accounts, redeploy Preview and complete that verification before considering any launch.

The first pilot deliberately prevents opening another subscription while any existing subscription is linked, including an expired one; account management stays with its original provider. Fully expired subscriptions that cannot be restarted in that provider's portal need a reviewed resubscription flow before a public paid launch. Ambiguous checkout initialization failures retain their reference to prevent duplicate recurring charges; an operator must reconcile an unresolved checkout before clearing it. No automatic retry creates another provider subscription.

Financial disputes and chargebacks need an explicit reconciliation policy before live billing. The current test pilot processes confirmed full refunds and disables renewals before account deletion; it is not a certification of live operational readiness.

## Official integration references

- [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Paystack payment verification](https://paystack.com/docs/payments/verify-payments/)
- [Paystack webhook signatures](https://paystack.com/docs/payments/webhooks/)
- [Polar TypeScript SDK](https://polar.sh/docs/integrate/sdk/typescript)
- [Polar sandbox](https://polar.sh/docs/integrate/sandbox)
- [Polar webhook delivery](https://polar.sh/docs/integrate/webhooks/delivery)
