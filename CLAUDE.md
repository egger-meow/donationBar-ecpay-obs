# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Goal

DonationBar is being built into a production-grade, multi-tenant SaaS that streamers worldwide can pay for and trust during live broadcasts: ECPay (綠界) payment integration + real-time OBS donation-progress overlays. Optimize for payment correctness, reliable OBS overlays, simple onboarding, and safe multi-tenant operation. ECPay is the current payment integration, not the final geographic boundary of the product.

## Commands

```bash
npm install
npm run dev      # node --watch server.js (auto-restart)
npm start        # node server.js
npm test         # node --test (runs everything under test/)
npm run test:ui  # node --test test/ui-scripts.test.js
npm run migrate  # runs migrations/migrate.js, run-subscription-migration.js, run-payment-idempotency-migration.js, run-activation-tracking-migration.js, encrypt-provider-credentials.js in sequence
```

- Run a single test file directly: `node --test test/ecpay.test.js`
- Node.js 18+ required (CI uses Node 20). ES modules throughout (`"type": "module"` in package.json).
- There is currently no lint script and no `migrate:rollback` implementation. Do not claim those checks passed until the tooling actually exists and succeeds.
- CI (`.github/workflows/ci.yml`) runs on push to `main`/`master`/`multiuser` and on PRs: `npm ci` → `npm test` → `npm audit --omit=dev --audit-level=high` → `docker build`.

## Architecture

### Storage: JSON-or-Postgres abstraction

[database.js](database.js) exports a single `Database` class instance used everywhere as `import database from './database.js'`. It transparently switches backend based on environment:
- `ENVIRONMENT=sandbox` → always uses local `db.json` (dev/testing only).
- `DATABASE_URL` set (or `ENVIRONMENT`/`NODE_ENV=production`) → PostgreSQL via `pg`, with SSL config from [database-ssl.js](database-ssl.js).
- In production, a missing `DATABASE_URL` is a hard startup failure — JSON fallback is intentionally disabled in production (never silently degrade).

Payment provider credentials (per-workspace ECPay `HashKey`/`HashIV`) are encrypted at rest via [credentials.js](credentials.js) (`aes-256-gcm`, key from `CREDENTIAL_ENCRYPTION_KEY`). `decryptCredential` throws if a value isn't in the `enc:v1:` envelope format, which is what forces `npm run migrate`'s `encrypt-provider-credentials.js` step to run before production start.

### Multi-tenant workspace model

Every stream/overlay/donation flow is scoped to a **workspace**, identified by a `slug`. Routes accept the slug via path param (`/overlay/:slug`, `/donate/:slug`, `/webhook/:slug`) or query/body param (`?slug=`), falling back to a `DEFAULT_WORKSPACE_SLUG` (`'default'`) for single-tenant/back-compat URLs. `getWorkspaceFromSlug()` in [server.js](server.js) is the resolution helper — any new route touching donations, overlays, goals, or webhooks must resolve and scope through a workspace the same way. Don't add code that reads/writes donation or settings data without going through the resolved workspace ID.

### server.js layout

[server.js](server.js) is a single large Express app (routes, auth, ECPay flows, subscriptions, webhooks, SSE all in one file — see AGENTS.md guidance below on not doing unrelated rewrites of it). Key pieces, top to bottom:
- Security middleware: `helmet`, rate limiting, a static-file guard that 404s direct access to `admin.html`/`overlay.html`/`donate.html` (must be reached through their authenticated/slugged routes, not as raw static assets), `express-session` (Postgres-backed store in production via `connect-pg-simple`), Passport (session + Google OAuth strategy).
- Auth/authorization middlewares: `requireAdmin`, `requireAuth`, `requirePlatformAdmin` (platform-wide admin, gated by `PLATFORM_ADMIN_EMAILS` in [config.js](config.js)), `requireActiveSubscription` (workspace-level paywall gate), `requireSameOrigin` ([security.js](security.js), origin/referer check for state-changing POSTs).
- Donation flow: `/create-order` builds an ECPay checkout request; `/success` and `/ecpay/return` handle the buyer-facing redirect back; `/webhook/:slug` is the async ECPay payment notification (must verify `CheckMacValue` via [ecpay.js](ecpay.js) and be idempotent).
- Subscription flow (recurring billing for the streamer's own DonationBar subscription, separate from one-off viewer donations): `/subscription/checkout`, `/ecpay/period/callback`, `/subscription/cancel`, `/subscription/pause`, `/subscription/resume`, `/api/subscription/status`, `/api/subscription/payment-history`. Uses a separate "billing" ECPay credential pair (`BILLING_ECPAY_*` env vars / `getBillingECPayCredentials()`), distinct from a workspace's own donation-collection ECPay credentials.
- Real-time overlay updates: `/events` (SSE) and `/progress`, both scoped by workspace slug.
- Health checks: `/health/live` (liveness) and `/health/ready` (checks `database.healthCheck()`).

### ECPay integration ([ecpay.js](ecpay.js))

`generateCheckMacValueForCredentials` / `verifyCheckMacValueForCredentials` implement ECPay's official CheckMacValue algorithm (URL-encode per ECPay's custom rules, SHA-256, uppercase). Always verify webhook/callback payloads against the *unmodified* payload using `crypto.timingSafeEqual`-based comparison (already done in `verifyCheckMacValueForCredentials` — don't replace with a naive `===`).

### Config & validation ([config.js](config.js))

`validateProductionConfig()` runs at server startup and throws with an aggregated list of errors if any production requirement is missing: `DATABASE_URL`, a strong non-placeholder `SESSION_SECRET` (32+ chars), HTTPS `BASE_URL`, a valid `CREDENTIAL_ENCRYPTION_KEY`, Google OAuth + billing ECPay credentials, at least one `PLATFORM_ADMIN_EMAILS` entry, and `ECPAY_ENVIRONMENT` being `stage` or `production`. When adding new required production config, extend this function rather than checking ad hoc at the call site.

### Frontend ([public/](public/))

Dependency-free HTML/CSS/JS — no build step, no framework. `admin.html`, `donate.html`, `login.html`, `overlay.html` are workspace-facing pages served only through their authenticated/slugged Express routes (direct static access is blocked, see above). `overlay.html` is the OBS Browser Source page: keep it resilient to SSE reconnects, avoid layout shift, and support the `fg`/`bg`/`bar`/`bar_light` query-param color overrides and `?test=1` demo mode described in [README.md](README.md).

### Migrations ([migrations/](migrations/))

Plain Node scripts (not a migration framework) run in sequence by `npm run migrate`: `migrate.js` (base schema + initial admin user from `ADMIN_*` env vars), `run-subscription-migration.js`, `run-payment-idempotency-migration.js`, `encrypt-provider-credentials.js`. There is no rollback tooling — document rollback steps manually with any schema change.

### Legacy/reference files — do not extend

`database-old-backup.js`, `server-old-backup.js`, `db.json.backup` are historical references only.

## Working Rules

- Keep secrets and real customer data out of Git. Update `.env.example` whenever configuration changes.
- Never log credentials, session values, OAuth tokens, ECPay `HashKey`/`HashIV`, personal data, or full payment payloads.
- Preserve tenant boundaries: every workspace-owned read/write, stream, overlay, donation, and webhook operation must be scoped to the resolved workspace.
- Treat money as integer minor units with an explicit ISO 4217 currency. Never use floating point for monetary calculations.
- Verify webhook signatures against the unmodified provider payload, make processing idempotent, and acknowledge only after durable state is correct.
- Validate and normalize all external input at the HTTP boundary. Return stable, non-sensitive errors.
- Keep OBS browser-source compatibility in mind: overlays must reconnect after network interruption, avoid layout shifts, and remain readable at common canvas sizes.
- Keep user-facing text ready for localization; don't embed locale assumptions in payment or date/number formatting logic.
- Prefer focused modules when changing a large concern in `server.js`; avoid unrelated rewrites of the monolith.
- Do not edit backup (`*-old-backup.js`, `db.json.backup`) files as part of normal implementation.
- Add automated tests when changing authentication, authorization, workspace resolution, payment signatures, webhook idempotency, subscription state, money calculations, or database migrations. Tests must use sandbox credentials/fixtures, never live payment credentials.
- For UI work, verify both desktop and mobile layouts. For overlay work, also verify the exact OBS-style viewport, transparent background, initial load, SSE reconnect, and long localized text. Report checks that could not be run.

## Documentation

`docs/` contains setup, database, migration, feature, and API reference material (index at [docs/README.md](docs/README.md)); some documents may be stale — verify behavior against the code. Keep `README.md` focused on reproducible local setup and link detailed material from `docs/`. Do not describe roadmap work as shipped functionality.
