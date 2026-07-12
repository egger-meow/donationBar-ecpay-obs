# Payment Callback Route Audit

Status: source review completed 2026-07-12. This is a code-level route inventory, not
proof of provider delivery or staging behavior. Run the staging evidence exercises in
ROADMAP.md before treating any payment flow as release-ready.

## Registered routes

| Route | Role | State mutation | Required protection |
|---|---|---|---|
| `POST /webhook/:slug` | Workspace ECPay donation notification | Adds a donation only after merchant/transcode/decryption/status checks | Resolved workspace credentials, provider payload decryption, workspace-scoped idempotency |
| `POST /ecpay/return` | Initial subscription callback **or** legacy donation return | Subscription callback core or idempotent donation fallback | Platform merchant match + callback verification, or workspace CheckMacValue |
| `POST /ecpay/period/callback` | Recurring subscription notification | Subscription callback core | Provider callback verification and payment-history idempotency |
| `POST /success` | Donation OrderResultURL fallback | Idempotent donation fallback, then client redirect | Workspace CheckMacValue and merchant match |
| `GET/POST /subscription/success` | Client navigation after subscription checkout | None | No payment state mutation |

The only registered workspace webhook is `POST /webhook/:slug`; a regression test
asserts this remains true. Multiple routes intentionally see a successful donation
because ECPay can invoke notification/return/result URLs independently. They all funnel
through `addDonation()`, whose workspace/trade-number persistence is idempotent, so a
later provider callback cannot create a second donation after a valid fallback.

## Legacy implementation cleanup

The previously unregistered duplicate donation webhook, default-workspace router, and
encrypted recurring-callback implementation have been removed from `server.js`. There
is now no legacy callback implementation available to revive accidentally; future
webhook work belongs in the canonical routes listed above.

## Limits of this audit

- It does not prove ECPay's actual callback ordering, retry timing, IP behavior, or
  initial/recurring merchant eligibility.
- It does not substitute for real staging success/failure/replay/cancellation evidence.
- It does not reverse migrations or resolve legal/provider restrictions.
