# Progress Log

## Progress index (section names)

This is an index only; the complete dated entries and building path remain below.

- 2026-07-12 — Align recruitment draft with one-streamer gate (P1 beta)
- 2026-07-12 — Clarify real-payment activation evidence (P1 activation)
- 2026-07-12 — Sandbox SSE test-alert for real OBS verification (P1 activation)
- 2026-07-12 — Chinese activation test-alert path (P1 activation)
- 2026-07-12 — Thin provider-independent donation event and ECPay adapter (P0/P1 core)
- 2026-07-12 — Bound Postgres readiness health checks (P0 operations)
- 2026-07-12 — Roadmap reset around thin ECPay core and first external streamer
- 2026-07-12 — Explicit Asia/Taipei ECPay order timestamps (P0 payment correctness)
- 2026-07-12 — Progress index consistency guard
- 2026-07-12 — Collision-resistant provider trade numbers (P0 payment correctness)
- 2026-07-12 — Rotate OAuth sessions after authentication (P0 security)
- 2026-07-12 — Bound overlay alerts for short viewports and long text (P1 reliability)
- 2026-07-12 — Track overlay SSE reconnect handles (P1 reliability)
- 2026-07-12 — Staging preflight verifies observability and CSP (P0)
- 2026-07-12 — Same-origin mutation-route audit guard (P0)
- 2026-07-12 — Remove unregistered legacy payment callbacks (P0)
- 2026-07-12 — CI-equivalent release checks and alert vocabulary sync (P0)
- 2026-07-12 — Raw-body ECPay signature verification across callbacks (P0)
- 2026-07-12 — Strict platform subscription money normalization (P0)
- 2026-07-12 — Strict donation money normalization at persistence boundary (P0)
- 2026-07-12 — Payment callback/duplicate-webhook route audit (P0)
- 2026-07-11 — Content Security Policy enabled with ECPay compatibility (P0)
- 2026-07-11 — Public progress payload minimization and overlay console redaction (P0)
- 2026-07-11 — Same-origin protection for public donation order creation (P0)
- 2026-07-11 — Production dependency audit clean (P0 evidence)
- 2026-07-11 — P0 callback rate-limit isolation
- 2026-07-11 — P0 SSE notification isolation and webhook-reference redaction
- 2026-07-11 — P0 sensitive logging remediation in database and email paths
- 2026-07-11 — Authenticated creator data export, privacy-operation boundaries (P0 support)
- 2026-07-11 — Beta operations runbook prepared (P1)
- 2026-07-11 — Configuration-backed, public closed-beta pricing
- 2026-07-11 — Guided activation funnel timing and ordered live-alert heuristic
- 2026-07-11 — Real local PostgreSQL migration/backup/restore rehearsal, two real bugs found and fixed
- 2026-07-11 — Mobile/desktop verification of this session's UI changes, beta recruitment draft
- 2026-07-11 — Guided activation checklist (P1, first slice)
- 2026-07-11 — Real (unmocked) local alert-delivery exercise
- 2026-07-11 — Observability cleanup, doc corrections, repo tidy-up
- Project history (reconstructed from commit history and now-removed docs)

This is the single running record of what has actually shipped. It replaces the old
pattern of one-off `*_SUMMARY.md` / `*_UPDATE.md` docs that used to accumulate under
`docs/development/` and `docs/features/` — those described features (local-password
signup/reset, an early single-tenant webhook) that no longer exist in the code and were
removed rather than left to mislead readers (see the 2026-07-11 entry below).

**Rules for this file:** append new entries at the top, newest first. Never edit or
delete a past entry — if something it describes later changes or turns out wrong, say so
in a new entry instead. This file records *what happened*; it is not a priority list.
For what's next, see [ROADMAP.md](../ROADMAP.md), whose priority tables get edited in
place as work completes or priorities shift.

---

## 2026-07-12 - Align recruitment draft with one-streamer gate (P1 beta)

Removed a roadmap contradiction in the outreach material:

- The draft now instructs the owner to contact exactly one qualified unfamiliar streamer
  first, observe the complete self-service path, and pause or expand only from evidence.
- Batch recruitment is explicitly deferred until the first-streamer gate passes, then
  the sequence is five followed by 10–20.

Verification: documentation-only change; `npm.cmd test` remains the required repository
regression check before commit.

## 2026-07-12 - Clarify real-payment activation evidence (P1 activation)

Corrected the checklist so a sandbox visual test cannot be mistaken for a real
payment milestone:

- The first-payment step now explicitly says the non-persistent test alert does not
  count toward `firstDonationAt`.
- The checklist still lets a creator verify OBS first, then requires an actual payment
  for the activation metric and first-streamer gate.
- Added a regression assertion for the wording so future UI edits preserve the boundary.

Verification: `npm.cmd test` passes **95/95** tests and `git diff --check` passes.

## 2026-07-12 - Sandbox SSE test-alert for real OBS verification (P1 activation)

Closed the remaining gap between a local preview and a real Browser Source check:

- Added an authenticated `/admin/activation/test-alert` route available only outside
  production. It uses the canonical test adapter and sends a transient event through
  the real workspace SSE stream.
- The event is deliberately not persisted, does not increment totals, and does not
  advance `firstDonationAt`; it is safe to use before a real payment.
- Added an admin button and Chinese instruction to paste the overlay URL into OBS and
  verify the test alert within 15 minutes. The existing local preview remains available.
- Added source regression coverage for the sandbox-only and non-persistent guarantees.

Verification: `npm.cmd test` passes **95/95** tests and `git diff --check` passes. A real
OBS viewport check and first-unfamiliar-streamer evidence remain required.

## 2026-07-12 - Chinese activation test-alert path (P1 activation)

Closed the practical first-alert gap in the onboarding flow:

- The admin page now offers one-click OBS URL copy and a one-click visual test-alert
  window, with Chinese instructions to verify the Browser Source before real payment.
- Overlay `?test=1` mode is local-only (no SSE or payment callback), emits changing
  canonical alert IDs/messages, and visibly exercises the same alert renderer.
- Added UI/source regression coverage for the controls and test event path.

Verification: `npm.cmd test` passes **94/94** tests and `git diff --check` passes. Real
OBS viewport and first-unfamiliar-streamer evidence remain required.

## 2026-07-12 - Thin provider-independent donation event and ECPay adapter (P0/P1 core)

Started the roadmap’s thin Payment Core without building a universal provider system:

- Verified ECPay donation return/webhook payloads now normalize into one canonical event
  (`provider`, `externalId`, integer amount/currency, payer/message, provider record ID)
  before persistence and OBS broadcast.
- Added a small ECPay adapter for paid-status normalization and a credential-free test
  adapter for activation/UI tests; no unimplemented provider is exposed to users.
- The current scope remains create/verify/normalize/persist/emit/diagnostics/idempotency;
  refunds, capabilities, reconciliation, and a second real provider remain deferred.

Verification: `npm.cmd test` passes **93/93** tests and `git diff --check` passes. The
first external streamer must still prove the end-to-end real payment/OBS path.

## 2026-07-12 - Bound Postgres readiness health checks (P0 operations)

Prevented a half-open PostgreSQL connection from hanging `/health/ready` indefinitely:

- `database.healthCheck()` now bounds its `SELECT 1` probe to three seconds.
- On timeout, it marks the client disconnected and begins safe client teardown so the
  readiness route can return `503` and the existing alert path can fire.
- Added reusable timeout tests for completion, prompt failure/cleanup, and invalid input.

Verification: `npm.cmd test` passes **89/89** tests and `git diff --check` passes. A
hosted readiness/alert exercise remains a production gate.

## 2026-07-12 - Roadmap reset around thin ECPay core and first external streamer

Updated `ROADMAP.md` to make the launch sequence evidence-driven:

- Weeks 1–2 remain the production gate: hosted staging, OAuth, migrations/restore,
  ECPay callback lifecycle, monitoring, and legal baseline.
- Weeks 3–4 now deliver only the thin ECPay payment core plus activation path; weeks
  5–6 require one unfamiliar streamer to self-serve the complete real-payment/OBS flow
  before any 5- or 10–20-person cohort.
- Weeks 7–8 now test a concrete Founder Plan at NT$199/299/399 with recorded acceptance
  and refusal reasons, and the architecture/product/business DoD makes the provider-
  independent event boundary explicit.
- Refunds, partial refunds, capability matrices, complex reconciliation, and a second
  real provider remain deliberately deferred until user evidence supports them.

This changes sequencing and definitions of done; it does not claim any external gate is
complete.

## 2026-07-12 - Explicit Asia/Taipei ECPay order timestamps (P0 payment correctness)

Made `MerchantTradeDate` independent of the host/container timezone:

- Donation and recurring-subscription checkout orders now format the provider-required
  `yyyy/MM/dd HH:mm:ss` value in `Asia/Taipei`, rather than using whatever local zone
  the deployment happens to expose.
- Added fixed-instant tests covering the UTC-to-Taiwan conversion and invalid dates.

Verification: `npm.cmd test` passes **86/86** tests and `git diff --check` passes. Real
ECPay acceptance remains a staging gate.

## 2026-07-12 - Progress index consistency guard

Added a documentation-maintenance regression test that compares the top section-name
index with every `##` heading in this file. Future progress entries now fail the suite
until their section name is added to the index, keeping the fast status view aligned
with the complete build history.

Verification: `npm.cmd test` passes **84/84** tests and `git diff --check` passes.

## 2026-07-12 - Collision-resistant provider trade numbers (P0 payment correctness)

Closed a same-millisecond order-ID collision risk in both payment families:

- Public donation orders now use an alphanumeric ECPay-compatible identifier with a
  timestamp component plus 40 bits of randomness, capped at 20 characters.
- Platform subscription checkout orders use the same generator with a bounded prefix
  and 32 bits of randomness, also within the provider limit.
- Added deterministic tests for length, character set, entropy sizing, and invalid
  inputs. This prevents concurrent orders from being mistaken for one idempotent trade.

Verification: `npm.cmd test` passes **83/83** tests and `git diff --check` passes. Real
provider acceptance and replay evidence remain staging gates.

## 2026-07-12 - Rotate OAuth sessions after authentication (P0 security)

Hardened the Google OAuth callback against session fixation:

- After Passport validates the provider response, the server now regenerates the
  session identifier and re-establishes the authenticated user before setting session
  fields or redirecting to the admin area.
- Added a regression test that requires both session regeneration and the post-rotation
  `req.logIn` call to remain in the callback chain.

Verification: `npm.cmd test` passes **81/81** tests and `git diff --check` passes. Real
production-domain OAuth evidence remains a launch gate.

## 2026-07-12 - Bound overlay alerts for short viewports and long text (P1 reliability)

Improved OBS/browser-source rendering without changing the donation payload:

- Alert placement now scales with viewport height instead of assuming a tall canvas.
- The alert card is bounded to the viewport with internal scrolling, and long localized
  donor messages are capped and scrollable rather than pushing the overlay off-screen.
- Added a source regression test for the short-viewport and long-message CSS guards.

Verification: `npm.cmd test` passes **80/80** tests and `git diff --check` passes. Real
transparent OBS viewport screenshots and interruption tests remain open evidence.

## 2026-07-12 - Track overlay SSE reconnect handles (P1 reliability)

Fixed an OBS Browser Source lifecycle bug: when an SSE connection closed, the retry
created a new connection but left the global cleanup handle pointing at the old one.
Reconnects now assign the replacement connection to the global handle, so unload closes
the active stream and repeated retries do not leave an orphaned connection behind.

Added a source regression test for the reconnect/cleanup relationship. Verification:
`npm.cmd test` passes **79/79** tests and `git diff --check` passes. Real OBS viewport,
network-interruption, and long-text evidence remains a staging gate.

## 2026-07-12 - Staging preflight verifies observability and CSP (P0)

Strengthened the read-only release preflight used before hosted staging exercises:

- It now checks `/health/live`, `/health/ready`, and `/api/pricing` without touching
  payment, OAuth, or mutation endpoints.
- It requires a response `X-Request-Id` and enforced `Content-Security-Policy`,
  catching deployments that are reachable but missing the production observability or
  browser-security middleware.
- Added redacted pass/fail coverage for missing headers and updated the staging/setup
  runbooks to describe the three checks.

Verification: `npm.cmd test` and `git diff --check` pass. The preflight still does not
prove provider callbacks, hosted database durability, or legal readiness. A real local
sandbox HTTP smoke check also returned `200` for `/health/live` and `/api/pricing` with
request-ID and CSP headers present; hosted staging remains unproven.

## 2026-07-12 - Same-origin mutation-route audit guard (P0)

Audited every `POST`, `PUT`, `PATCH`, and `DELETE` route in `server.js`:

- Browser-initiated mutations (logout, feedback, public order creation, admin changes,
  and subscription lifecycle actions) all require `requireSameOrigin`.
- Provider callbacks and the subscription result navigation are explicitly excluded
  because ECPay or a browser redirect—not a same-origin application form—invokes them;
  their own signature or display-only protections remain in place.
- Added a source-level regression test that flags any future browser mutation route
  declared without same-origin middleware.

Verification: `npm.cmd test` and `git diff --check` pass. This is route-configuration
coverage; it does not replace real browser and staging exercises.

## 2026-07-12 - Remove unregistered legacy payment callbacks (P0)

Completed the source-cleanup debt identified in the callback route audit:

- Removed the unregistered duplicate donation webhook, default-workspace router, and
  old encrypted recurring-callback implementation from `server.js`.
- The canonical workspace webhook and subscription callback core are now the only
  payment callback implementations in the server source; no legacy fallback can be
  accidentally reconnected without an explicit new route.
- Updated the route-audit regression to fail if any removed implementation returns.

Verification: `node --check server.js`, `npm.cmd test`, and `git diff --check` are
required before commit. Real provider callback and staging evidence remains open.

## 2026-07-12 - CI-equivalent release checks and alert vocabulary sync (P0)

Closed a documentation drift found during the observable-operations audit:

- Updated the monitoring runbook's fixed external-alert vocabulary to include the
  `payment_webhook_invalid_signature` signal shipped in the raw-body callback slice.
- Re-ran `npm.cmd test`: **76/76** tests passed.
- Re-ran `npm.cmd audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- The local Docker daemon was unavailable (`/_ping` returned HTTP 500), so the CI
  container-build check remains unproven and must run in GitHub Actions or a working
  Docker environment before release.

This is repository-level verification only; hosted staging, provider callbacks, and
legal/accounting approval remain launch gates.

## 2026-07-12 — Raw-body ECPay signature verification across callbacks (P0)

Added the missing active-webhook verification step to the raw-body implementation:

- `POST /webhook/:slug` now rejects invalid outer `CheckMacValue` before decrypting
  ECPay `Data`, broadcasting diagnostics, or calling `addDonation()`.
- `POST /ecpay/return`, `/success`, and recurring `/ecpay/period/callback` all pass the
  captured raw form body through their signature verification paths; duplicate raw form
  keys fail closed.
- Added the allowlisted `payment_webhook_invalid_signature` monitoring event with a
  redacted payload contract and a route-order regression test.

Verification: `npm.cmd test` passes **76/76** tests, including raw-form verification,
duplicate-key rejection, and active webhook ordering. Body Parser raw-buffer guidance
was consulted. Staging/provider replay evidence remains open.

## 2026-07-12 — Strict platform subscription money normalization (P0)

Extended the money invariant to recurring platform billing:

- `subscription-callback.js` now uses the shared minor-unit parser for provider
  `PeriodAmount`/`TradeAmt` and the stored expected plan price. Decimal, malformed,
  zero, negative, and out-of-range values cannot create payment history.
- `database.createPaymentRecord()` validates amount and supported currency before either
  PostgreSQL or sandbox persistence, and validates optional cumulative-success totals
  (including legitimate zero for a failed callback).
- Added a decimal recurring-callback regression fixture; all existing success/failure,
  signature, wrong-amount, and duplicate/idempotency tests remain green.

Verification: `npm.cmd test` passes **74/74** tests and `git diff --check` passes. Real
ECPay recurring callbacks and reconciliation remain staging evidence gates.

## 2026-07-12 — Strict donation money normalization at persistence boundary (P0)

Closed a payment-correctness gap found in the callback audit:

- `database.addDonation()` now validates every path before opening a PostgreSQL
  transaction or writing JSON: amount must be a positive integer minor-unit value within
  the existing donation maximum, and currency must be an explicitly supported code.
- DonationBar's current ECPay settlement allowlist is only `TWD`; arbitrary three-letter
  strings and unsupported currencies are rejected rather than silently persisted.
- The normalized amount/currency and bounded payer/message values are reused for the
  donation row and workspace totals, preventing a float or malformed value from making
  the aggregate disagree with the recorded donation.
- Added pure money tests covering decimals, signs, scientific notation, bounds, case,
  and unsupported currencies. Invalid provider callback money raises before persistence,
  allowing the callback error path/provider retry behavior to remain visible.

Verification: `npm.cmd test` passes **74/74** tests and `git diff --check` passes. Real
provider callback fixtures and staged currency behavior remain open release evidence.

## 2026-07-12 — Payment callback/duplicate-webhook route audit (P0)

Completed the production-checklist source review for duplicate webhook routes:

- Added [WEBHOOK_ROUTE_AUDIT.md](operations/WEBHOOK_ROUTE_AUDIT.md), mapping the sole
  active workspace webhook, donation-result fallbacks, initial/recurring subscription
  callbacks, and navigation-only subscription success URLs.
- Confirmed `POST /webhook/:slug` is the only registered workspace webhook. ECPay can
  independently call notification/return/result URLs; their donation mutations all use
  the workspace/trade-number idempotency path rather than competing persistence logic.
- The older `legacyDuplicateWebhookHandler` has no registration or call site, so cannot
  receive traffic. It is recorded as source-cleanup debt and must not be revived; future
  webhook work belongs in the canonical active handler.
- Added regression tests for the single route registration, no legacy call site, and the
  expected callback inventory/idempotency funnel.

Verification: `npm.cmd test` passes **72/72** tests and `git diff --check` passes. This
is a source audit, not ECPay staging evidence.

## 2026-07-11 — Content Security Policy enabled with ECPay compatibility (P0)

Replaced the previous disabled Helmet CSP with an enforced policy tailored to the current
application:

- Defaults browser resources to same-origin; disallows plugins/objects; locks the base
  URL; limits frames to same-origin; and permits only same-origin connections and
  frames, plus `data:` image/media/font assets needed by current pages.
- Limits form submissions to same-origin and the exact ECPay stage/production checkout
  domains. This preserves generated ECPay auto-post forms without allowing arbitrary
  form destinations.
- Keeps `'unsafe-inline'` only for the repository's existing static inline scripts and
  styles. A nonce-based CSP is the future hardening path once pages are modularized;
  this change does not overstate that limitation.
- Enables `upgrade-insecure-requests` only in production so sandbox/localhost HTTP
  workflows remain usable. `crossOriginEmbedderPolicy` remains disabled for OBS
  compatibility.

Verification: `npm.cmd test` passes **69/69** tests, including CSP policy assertions;
a sandbox server returned the expected `Content-Security-Policy` header on
`/pricing.html`. Current Helmet CSP configuration guidance was consulted.

## 2026-07-11 — Public progress payload minimization and overlay console redaction (P0)

Removed provider transaction references from browser-visible donation progress:

- `getWorkspaceProgress()` now emits an opaque donation `alertId` for overlay alert
  deduplication instead of ECPay `tradeNo`. The provider trade number stays server-side
  for payment idempotency and is not exposed through public SSE/progress payloads.
- `overlay.html` now deduplicates on `alertId`, names its state accordingly, and no longer
  logs donor name/amount to the browser console. Donor-rendering paths were inspected:
  alert fields use `textContent`; recent-donation HTML escapes payer/message values.
- Added regression tests asserting the public payload contains `alertId` rather than
  `tradeNo`, and that the overlay does not use that provider field or log donor values.

Verification: `npm.cmd test` passes **67/67** tests and `git diff --check` passes.
Real OBS/browser viewport validation remains a staging evidence requirement.

## 2026-07-11 — Same-origin protection for public donation order creation (P0)

Closed a CSRF gap on the public donation checkout entry point:

- `POST /create-order` now runs the existing `requireSameOrigin` middleware before its
  order-creation handler, matching other browser-initiated mutations. Provider callback
  routes remain separate and are not subjected to browser-origin checks.
- Added a source-level regression test ensuring the middleware remains ahead of the
  async handler.
- Local sandbox smoke evidence: a request with `Origin: https://attacker.example` was
  rejected with HTTP 403; a request using the configured local origin reached the normal
  handler path. No further order requests were run.

Verification: `npm.cmd test` passes **65/65** tests and `git diff --check` passes.
Current Express middleware chaining guidance was consulted for the route configuration.
Real ECPay checkout/callback remains a staging evidence gate.

## 2026-07-11 — Production dependency audit clean (P0 evidence)

Ran the roadmap-required production dependency scan against the current npm lockfile:

- `npm.cmd audit --omit=dev --json` completed successfully against npm's advisory
  service with **0 vulnerabilities** (0 info, low, moderate, high, and critical).
- The audited dependency graph contains 127 production dependencies (156 total including
  development/optional dependencies). No dependency change was needed.

This is point-in-time dependency evidence for the committed lockfile, not a permanent
security claim. Re-run the same audit after dependency changes and immediately before a
staging/production release; it does not prove container-image, hosting, configuration,
or provider security.

## 2026-07-11 — P0 callback rate-limit isolation

Fixed a payment-correctness risk in the request middleware order:

- The general 300-IP/minute limiter previously ran before every ECPay webhook and
  recurring callback. Public traffic from the same source could therefore exhaust the
  callback's shared quota and yield a 429 before signature/idempotency processing.
- Added an explicit rate-limit policy: general traffic skips `/webhook` (including
  workspace-scoped webhook paths) and `/ecpay/period/callback`; those routes receive a
  separate, bounded 600-IP/minute callback limiter instead.
- Added pure policy tests covering legacy/workspace/recurring callback paths and the
  deliberately higher-but-finite provider budget. Current express-rate-limit guidance
  was consulted for the request-specific `skip` configuration and route middleware.

Verification: `npm.cmd test` passes **64/64** tests and `git diff --check` passes. The
limits are in-process defaults; multi-instance production deployment still needs a
shared limiter store and real provider/staging callback exercise.

## 2026-07-11 — P0 SSE notification isolation and webhook-reference redaction

Fixed a real tenant/privacy issue in the shared real-time stream:

- The `/events` SSE stream serves both owner-facing admin panels and public OBS/donation
  clients. `admin-notification` webhook diagnostics were previously broadcast to every
  connected client for the workspace. Connections now carry workspace and authorization
  metadata, and diagnostics go only to an authenticated session whose user owns that
  workspace.
- Ordinary progress and overlay-settings broadcasts remain workspace-scoped for OBS
  compatibility; only operational notification delivery changed.
- Removed `MerchantTradeNo` from the unpaid-webhook notification payload, avoiding a
  provider payment reference even for an authorized notification recipient.
- Added regression tests for the required owner-session gate and absence of the trade
  number in the unpaid branch.

Verification: `npm.cmd test` passes **62/62** tests and `git diff --check` passes. This
is source/local evidence; real OBS and staged webhook exercises remain required.

## 2026-07-11 — P0 sensitive logging remediation in database and email paths

Found and removed logging that contradicted the project's payment/privacy rules:

- `database.js` previously wrote donor names and amounts, ECPay trade numbers, and trial
  device fingerprints to stdout in both PostgreSQL and JSON paths. It now emits
  fixed-vocabulary structured events without those values.
- Removed logging of decoded `DATABASE_CA` content and raw PostgreSQL/JSON error values;
  failure events remain observable without exposing configuration or provider details.
- Email delivery failures no longer serialize the provider exception or return it to the
  caller. Generic non-sensitive status remains available for operations.
- Added source-level regression tests that reject donation/fingerprint/certificate/raw
  error interpolation in database logging and provider-error serialization in email logs.

Verification: `npm.cmd test` passes **60/60** tests and `git diff --check` passes. This
remediation covers the discovered database/email paths; it is not a substitute for the
still-required hosted monitoring and staging evidence.

## 2026-07-11 — Authenticated creator data export, privacy-operation boundaries (P0 support)

Shipped a tenant-safe self-service data-export capability that supports, but does not
complete, the P0 Legal/data baseline:

- `GET /account/export` is authentication-gated and exports only workspaces owned by the
  logged-in creator. It downloads a no-store JSON attachment from an allowlist-based
  builder rather than serializing database rows.
- The export includes useful account/workspace/settings/donation data while excluding
  ECPay credentials, provider/payment references, password/OAuth fields, sessions,
  fraud/audit data, and other internal records. It exposes only a boolean for ECPay
  configuration.
- Added an admin-page export link and [DATA_RIGHTS_RUNBOOK.md](operations/DATA_RIGHTS_RUNBOOK.md),
  which documents the feature and explicitly keeps account deletion manual pending
  legal, retention, billing, and identity-verification decisions.
- Also removed the final duplicate subscription trial/price fallback: database-created
  subscriptions now use the validated shared subscription-plan configuration used by
  checkout and callbacks.

Verification: `npm.cmd test` passes **58/58** tests, including secret/payment-reference
redaction in the export shape. A sandbox local-server smoke check confirms an
unauthenticated `/account/export` request redirects to login. Full authenticated
PostgreSQL export and legal data-rights handling remain unproven.

## 2026-07-11 — Beta operations runbook prepared (P1)

Prepared the operating process required by ROADMAP.md P1 Beta Operations:

- Added [BETA_OPERATIONS_RUNBOOK.md](operations/BETA_OPERATIONS_RUNBOOK.md): pre-invite
  checks; non-contractual P0–P3 support response targets; observed onboarding, week-one,
  biweekly, and exit touchpoints; a privacy-safe interview script; a weekly metric review;
  and the explicit four-week gate for declaring the roadmap row complete.
- Connected [BETA_RECRUITMENT_DRAFT.md](operations/BETA_RECRUITMENT_DRAFT.md) to the
  runbook, replacing its previous missing biweekly/exit process.
- The process directs participant/contact/payment records to an access-controlled private
  tracker, requires aggregate-only reporting, and aligns payment/availability events with
  the existing incident response runbook.

Verification: reviewed the new internal links and `git diff --check` passes. This is
**prepared, not operated**: no participant was contacted, no support SLA was promised,
and no four-week beta evidence exists yet.

## 2026-07-11 — Configuration-backed, public closed-beta pricing

Shipped the internally controllable part of ROADMAP.md P1 Paid Conversion: the offer
is now defined once and exposed truthfully to prospective creators.

- `getSubscriptionPlan()` validates the closed-beta trial and monthly TWD price. Checkout
  and recurring-callback amount verification now use that same value; malformed or
  unsafe production configuration fails startup instead of silently charging a fallback
  amount.
- Added public `GET /api/pricing` (no-store) and [pricing.html](../public/pricing.html),
  a Traditional Chinese, responsive offer page that fetches the configured price and
  trial length. It states clearly that NT$70 is an invitation-only validation price,
  not a public-launch pricing promise.
- Login and paywall pages link to the public source of truth rather than presenting a
  stale fixed amount. `.env.example` now defines the valid settings and their beta
  meaning.

Verification: `npm.cmd test` passes **57/57** tests, including plan default, custom
pricing, and invalid-production-settings tests; browser-script parsing includes the
new page. A sandbox local-server smoke check confirmed `GET /api/pricing` returns the
expected closed-beta TWD plan and `GET /pricing.html` returns HTTP 200. This does not
prove live ECPay checkout or real willingness-to-pay; those remain staging/beta gates.

## 2026-07-11 — Guided activation funnel timing and ordered live-alert heuristic

Completed the measurement half of ROADMAP.md's P1 Guided Activation slice without introducing third-party analytics or cross-tenant event access:

- `workspace_settings` now records `provider_configured_at` alongside the existing first OBS connection and first donation timestamps. The migration backfills a best-available timestamp from an existing complete ECPay provider row; subsequent credential rotations cannot rewrite the first configuration time.
- `GET /admin/activation` remains workspace-scoped and now returns timestamped provider, OBS, donation, and live-alert milestones. The admin checklist consumes the expanded shape unchanged visually.
- `GET /admin/platform/activation-funnel` is restricted by `requirePlatformAdmin` and returns only aggregate workspace counts plus median elapsed milliseconds from OAuth; it never returns workspace IDs, creator details, donor information, payment data, or provider credentials. This measures OAuth → workspace → provider → OBS → first donation → delivered-alert conversion and timing for the beta operations review.
- Corrected the earlier `liveAlertConfirmed` heuristic: a donation followed by a later overlay connection no longer counts as a delivered alert. The heuristic is now `liveAlertDelivered` only when OBS was connected before (or at) the first donation; it is still not proof that someone visually observed the alert.

Verification: `npm.cmd test` passes **55/55** tests, including new pure tests for aggregate median calculation, no per-tenant output, provider timing, and alert event ordering; the existing browser-page script parsing test also passes. `git diff --check` passes. This is local/sandbox evidence only: the activation UI and live-alert sequence still require real staging and OBS Browser Source verification before P1 or release evidence can be claimed complete.

## 2026-07-11 — Real local PostgreSQL migration/backup/restore rehearsal, two real bugs found and fixed

With explicit permission, installed PostgreSQL 17 natively via `winget` (no WSL2/Docker
needed — the earlier Docker Desktop attempt hit a wall requiring WSL2, unavailable on
this Windows 11 Home machine without an admin-elevated restart; PostgreSQL's own native
Windows installer needs neither). Created an isolated local database and ran the full
[docs/migration/MIGRATION_GUIDE.md](migration/MIGRATION_GUIDE.md) runbook against it —
Section 7 there has the filled-in evidence record. Summary:

- **Two real bugs found and fixed**, both of which would have broken `npm run migrate`
  against any genuinely fresh production/staging PostgreSQL database (i.e., it seems to
  have never actually been run against one before this):
  1. `migrations/migrate.js` unconditionally queried `app_data` to migrate legacy
     single-user data; a brand-new database has no such table, so this threw and rolled
     back the entire migration transaction, including the tables just created. Fixed
     with an existence check.
  2. `migrations/run-subscription-migration.js` resolved its SQL file path without the
     `migrations/` segment, so it always looked in the project root and always threw
     `Migration file not found`. Fixed to match its sibling scripts.
  Both are regression-tested via source inspection in `test/migration-security.test.js`
  (53 tests total now), since these scripts talk to a real database and aren't otherwise
  unit-testable — same tradeoff as `activation.js` below.
- Also fixed in passing: the same `'Anonymous'` (should be `'匿名'`) donor-fallback bug
  from the earlier TC-activation-path fix existed in `migrate.js`'s legacy-donation
  migration path too (only reachable when migrating real old single-user data, so it
  didn't surface in this fresh-database rehearsal).
- **A real, previously-undocumented limitation found and documented**: `npm run restore`
  (`pg_restore --clean --if-exists`) only recreates objects present in the backup being
  restored — it does not remove objects that exist in the target but weren't captured by
  that backup. Verified two ways: restoring an empty pre-migration backup over an
  already-migrated database left every migrated table in place; restoring a real
  post-migration backup after deliberately corrupting a column/view and adding an
  unrelated stray table correctly recreated the corrupted objects but correctly left the
  (never-captured) stray table untouched. Documented in MIGRATION_GUIDE.md Section 8 with
  the operational consequence spelled out: don't assume a restore fully reverts a bad
  deploy without independently checking for newer orphaned objects.
- Cleaned up afterward: dropped the local rehearsal database, deleted the local encrypted
  backup files, added `backups/` to `.gitignore` (was previously untracked-but-not-
  ignored — a real gap, since real backup rehearsals would otherwise risk being
  `git add -A`ed by accident).

**Not done, and explicitly out of scope for what a local rehearsal can prove**: this was
a real PostgreSQL engine, but not a hosted/staging one — no real network conditions, no
provider-specific TLS requirements, no provider connection limits or failure modes. This
project's own `.env` already has a `DATABASE_URL` for a real Aiven-hosted Postgres
instance with a placeholder password; the user has said they'll retrieve the real
password to enable the next, more representative rehearsal against that real host.

## 2026-07-11 — Mobile/desktop verification of this session's UI changes, beta recruitment draft

Belatedly ran the mobile/desktop verification CLAUDE.md requires for UI work, which had
been skipped for this session's earlier `admin.html`/`donate.html` edits. Started the
sandbox server, temporarily patched the local (gitignored, non-production) sandbox
`db.json` subscription to `trial` status to get past `requireActiveSubscription` and
actually view `/donate`, checked both a 375×812 mobile viewport and a desktop viewport:
no horizontal overflow at either size, the corrected `<h1>支持這個直播</h1>` renders
correctly, all form fields present and reachable. `admin.html` requires a real
authenticated session (`requireAdmin`), which sandbox mode has no way to establish
without Google OAuth configured; verified its responsive behavior by reading its
`@media (max-width: 768px)` rules instead of bypassing auth to force a render — the new
activation-checklist card reuses the existing `.card` class and plain block-level `<li>`
elements, nothing that needs its own media query. Reverted the `db.json` patch
afterward.

Also drafted (not sent) [docs/operations/BETA_RECRUITMENT_DRAFT.md](operations/BETA_RECRUITMENT_DRAFT.md)
per ROADMAP.md section 13/17: a screening checklist, a Traditional Chinese outreach
message, and week-1 check-in questions. Explicitly marked draft/unsent — actually
contacting anyone is the user's action, not something this session did or could do.

## 2026-07-11 — Guided activation checklist (P1, first slice)

Attempted a Docker-based local PostgreSQL rehearsal (the previous entry's blocker) with
the user's explicit permission to install Docker Desktop. Docker Desktop installed
cleanly via `winget`, but its engine requires WSL2, which is not installed on this
Windows 11 **Home** machine (Hyper-V isn't available on Home editions, so WSL2 is the
only backend option) — enabling it needs admin-elevated `wsl --install` and a system
restart. Stopped there: enabling an OS virtualization feature and restarting the machine
is "modifying system settings," which stays off-limits regardless of the earlier Docker
install consent, and a restart would interrupt whatever else is running on the machine.
The Postgres rehearsal remains blocked pending either the user running `wsl --install`
themselves, or a hosted staging `DATABASE_URL`.

Pivoted to P1 "Guided activation" (ROADMAP.md — flagged 100% unbuilt by the earlier TC
survey), since it needs no external access. Shipped the first slice:
- `activation.js` — new pure module, `computeActivationSteps({ provider, settings })`,
  covered by `test/activation.test.js` (5 cases). Follows the same
  extract-pure-logic-for-testability pattern as `subscription-callback.js`, since
  `database.js` itself has no test seam (`DB_PATH` is a hardcoded module constant, not
  injectable — a pre-existing gap, not something this change tries to fix).
- `migrations/20260711-add-activation-tracking.sql` +
  `migrations/run-activation-tracking-migration.js` — adds nullable
  `obs_connected_at`/`first_donation_at` columns to `workspace_settings`. Wired into the
  `npm run migrate` chain (now 5 scripts, was 4) in `package.json`; `CLAUDE.md` and
  `docs/migration/MIGRATION_GUIDE.md` updated to match.
- `database.js` — `markWorkspaceObsConnected`/`markWorkspaceFirstDonation`, each
  idempotent (first-write-wins) in both the Postgres and JSON/sandbox code paths.
  Idempotency verified directly against the JSON backend (not just read from the code).
- `server.js` — `GET /admin/activation` (new); the `/events` SSE handler now marks OBS
  connected only when the query carries `source=overlay` (added to `overlay.html`'s
  `EventSource` URL) so that `admin.html`/`donate.html` polling the same SSE stream for
  live UI updates don't produce a false "OBS connected" positive; the shared
  `addDonation()` helper marks first-donation on every successful donation-adding call
  site (webhook, `/ecpay/return`, `/success` POST, sandbox `/create-order`) since they
  all funnel through it already.
- `admin.html` — a checklist card, hidden once all four steps are complete so returning
  activated users aren't nagged.

Known limitation, stated plainly rather than glossed over: "live alert confirmed" is a
heuristic (`obsConnected && firstDonation`), not a confirmed visual observation — see the
doc comment in `activation.js`. Not yet built, and explicitly out of scope for this
slice: funnel timing (median time from OAuth → workspace → provider → test donation →
OBS → live alert, per ROADMAP.md section 14) and any analytics/event-tracking
infrastructure — there is none in this codebase. Verified only via `npm test` (51/51)
and manual sandbox smoke tests (server boot, auth-gating on `/admin/activation`, a real
sandbox donation setting `first_donation_at`, direct idempotency check on
`markWorkspaceObsConnected`); **not** verified against a real OBS Browser Source or real
staging.

## 2026-07-11 — Real (unmocked) local alert-delivery exercise

Ran `sendAlert('readiness_check_failed', ...)` from `observability.js` for real, twice,
outside the test suite: once against a throwaway local Node HTTP listener on loopback,
once against a refused local port. This is the first time this code path has opened a
real socket — every existing test (`test/observability.test.js`) stubs `global.fetch`.
Confirmed: the delivered POST body was exactly `{event, timestamp, request_id, route,
status_code}` (no PII, no credentials) with `Content-Type: application/json`, delivery
completed in ~30ms; the refused-connection case was caught, logged as
`alert_delivery_failed`, and did not throw or hang (~20ms). Documented in
[docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md](operations/MONITORING_AND_INCIDENT_RESPONSE.md)
Section 7 with an explicit caveat: this is **not** a staging/production exercise — no
real vendor endpoint, TLS, DNS, or egress path was involved — so
`ALERT_EXERCISE_TEMPLATE.md` is still unfilled and that gate is still open. It only rules
out a class of bugs a mocked-fetch test can't catch (URL/method/header/body construction,
unhandled rejection on connection refusal).

Also attempted a local rehearsal of `npm run migrate` / backup / restore against a real
PostgreSQL instance per `docs/migration/MIGRATION_GUIDE.md` (the P0 "Staging release
proof" gap). Blocked: this machine has neither Docker nor a local PostgreSQL install, and
installing either modifies the system, so it needs the user's explicit go-ahead first —
not attempted without asking. Real staging Postgres, a domain, Google OAuth production
credentials, an approved ECPay merchant account, and Taiwan legal/accounting review
remain blocked on the user's own action (see the current-status report delivered this
session) — none of those can be provisioned, paid for, or professionally reviewed by an
autonomous coding agent.

## 2026-07-11 — Observability cleanup, doc corrections, repo tidy-up

- Finished migrating `server.js`'s remaining `console.log`/`warn`/`error` calls to
  structured `logInfo`/`logWarn`/`logError` ([observability.js](../observability.js));
  removed `error.message` echoing from API error responses. Completes the P0
  "Observable operations" roadmap row for the logging half of that work.
- Corrected stale documentation that no longer matched the code:
  [docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md](operations/MONITORING_AND_INCIDENT_RESPONSE.md)
  had said "all logging is `console.log`, no structured logger" and described donor-PII
  logging that had already been removed; [AGENTS.md](../AGENTS.md) had said no tests
  existed (46 exist); [ROADMAP.md](../ROADMAP.md)'s status line had a stale test count
  (19 → 46) and was missing several shipped items (structured logging/alerting, staging
  preflight, recurring-subscription callback tests).
- Surveyed the Traditional Chinese activation path end to end (signup → workspace →
  ECPay config → OBS URL → test donation → live alert) and fixed what it found: the
  donor-anonymity fallback in `server.js` (5 call sites) sent the English word
  `'Anonymous'` all the way to the live OBS overlay instead of `'匿名'`, because the
  server-sent value was already truthy and never reached `overlay.html`'s client-side
  `donor || '匿名'` fallback; `admin.html`/`donate.html` had English `<title>`/`<h1>`
  text and English `showAlert`/`confirm` strings in the subscription-management panel;
  `admin.html`'s cancel/pause-subscription handlers had dead, unreachable `confirm()`
  code left over from an unfinished localization pass (deleted, and the real zh-TW
  confirmation text moved into the live `cancelSubscription()` path); and
  `docs/subscription/ECPAY_SETUP_CHECKLIST.md` referenced a hardcoded `server.js` line
  for the stage/production ECPay switch that was replaced by the `ECPAY_ENVIRONMENT` env
  var months ago, and conflated workspace ECPay credentials with the platform's own
  `BILLING_ECPAY_*` billing credentials — both corrected. Not fixed, and explicitly
  out of scope for a repair: no onboarding-checklist or activation-funnel tracking UI
  exists anywhere in the app. That's real net-new P1 work (roadmap "Guided activation"),
  not a repair.
- Removed five docs describing functionality that no longer exists in the codebase —
  `docs/development/CHANGES_SUMMARY.md`, `docs/development/SERVER_UPDATE_SUMMARY.md`,
  `docs/features/ADMIN_PANEL_UPDATE.md`, `docs/features/AUTH_FEATURES_SUMMARY.md`,
  `docs/features/AUTH_PAGES_STYLING_UPDATE.md`. All five documented a local-password
  signup/forgot-password/reset-password flow (`signup.html`, `forgot-password.html`,
  `reset-password.html`) and an early single-tenant `/webhook/ecpay` design; none of
  those pages exist in `public/` today — auth is Google OAuth-only (see
  `docs/setup/COMPLETE_SETUP_GUIDE.md`, rewritten for this earlier in the same day) and
  the webhook is workspace-scoped (`/webhook/:slug`). Kept as history in the "Project
  history" section below instead of as live docs, since a reader following them today
  would be sent looking for pages and code paths that don't exist.
- Rewrote `docs/README.md`'s index to drop links to the removed docs and to a
  `docs/collaboration/CLAUDE_CODE_COWORK.md` file that `docs/README.md` and
  `docs/next-direction.md` both referenced but was never actually committed (a leftover
  from an untracked local cowork-coordination file used in an earlier session).

## Project history (reconstructed from commit history and now-removed docs, not a live entry)

- **2025-09 to 2025-11 — single-tenant MVP.** ECPay checkout + webhook, admin login,
  overlay, initial `/webhook/ecpay` with AES-128-CBC `Data` decryption, local
  username/password admin auth.
- **2025-11 — multi-tenant rewrite.** Workspace-scoped routes and database schema,
  Google OAuth login, per-workspace ECPay credential storage, SSE reliability
  improvements, trial-abuse prevention. A short-lived local-password
  signup/forgot-password/reset-password flow (email verification via `email.js`/SMTP)
  was built during this phase and later removed in favor of OAuth-only auth — this is
  the flow the five docs removed in the entry above described.
- **2025-12 to 2026-02 — subscription billing.** Recurring ECPay billing, payment
  history tracking, admin panel goal management, PostgreSQL SSL/CA hardening.
- **2026-07-11 — production-hardening pass (single day, per commit history).** Encrypted
  tenant payment credentials, OAuth state validation, strict money/input validation,
  protected static-page bypass fix, legal policy pages, CI release verification,
  encrypted PostgreSQL backup/restore tooling, structured observability plus an optional
  alert webhook, a staging-preflight CLI check, recurring-subscription callback test
  coverage, and the cleanup entry above.
