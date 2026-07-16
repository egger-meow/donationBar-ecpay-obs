# AGENTS.md

## Product Goal

Build DonationBar into a production-grade SaaS that streamers worldwide can pay for and trust during live broadcasts. Optimize for payment correctness, reliable OBS overlays, simple onboarding, and safe multi-tenant operation. ECPay is the current payment integration, not the final geographic boundary of the product.

## Repository Map

- `server.js`: Express application, authentication, routes, ECPay flows, subscriptions, webhooks, and SSE. Stays at repo root as the entry point; everything below lives in `lib/`.
- `lib/database.js`: JSON/PostgreSQL persistence abstraction and schema initialization.
- `lib/email.js`: SMTP email delivery.
- `lib/`: every other non-route module `server.js` depends on (config, credentials, ECPay signing, security, activation, money, observability, etc.).
- `public/`: dependency-free HTML/CSS/JavaScript pages for admin, donation, login, and OBS overlay views.
- `migrations/`: PostgreSQL schema and migration scripts, plus `show-schema.js` (dev-only schema viewer).
- `providers/`: payment-provider adapters (ECPay donation-event normalization today).
- `operations/`: backup, restore, and staging-preflight scripts.
- `docs/`: setup, architecture, API, deployment, and feature notes. Some documents may be stale; verify behavior in code.

## Commands

```bash
npm install
npm run dev
npm start
npm run migrate
```

Node.js 18 or newer is required. `npm test` (node --test) runs the suite under `test/`. There is currently no lint script and no `migrate:rollback` implementation — rollback means restoring the pre-migration backup, not a reverse migration (see `docs/migration/MIGRATION_GUIDE.md`). Do not claim a check passed or that the app is production-ready until the corresponding tooling exists and succeeds.

## Working Rules

- Use ES modules and follow the existing JavaScript style unless a scoped migration is part of the task.
- Keep secrets and real customer data out of Git. Update `.env.example` whenever configuration changes.
- Never log credentials, session values, OAuth tokens, ECPay `HashKey`/`HashIV`, personal data, or full payment payloads.
- Preserve tenant boundaries. Every workspace-owned database read/write, stream, overlay, donation, and webhook operation must be scoped to the resolved workspace.
- Treat money as integer minor units with an explicit ISO 4217 currency. Never use floating point for monetary calculations.
- Verify webhook signatures against the unmodified provider payload, make processing idempotent, and acknowledge only after durable state is correct.
- Validate and normalize all external input at the HTTP boundary. Return stable, non-sensitive errors.
- Do not silently fall back to local JSON storage in production. Startup should fail clearly when required production infrastructure is unavailable.
- Keep OBS browser-source compatibility in mind: overlays must reconnect after network interruption, avoid layout shifts, and remain readable at common canvas sizes.
- Keep user-facing text ready for localization. Do not embed locale assumptions in payment or date/number formatting logic.
- Prefer focused modules when changing a large concern in `server.js`; avoid unrelated rewrites of the monolith.
- Do not edit backup files as part of normal implementation.

## Verification

For every change, run the closest available command and manually exercise the affected route or page. Add automated tests when changing authentication, authorization, workspace resolution, payment signatures, webhook idempotency, subscription state, money calculations, or database migrations. Tests must use sandbox credentials and fixtures, never live payment credentials.

For UI work, verify both desktop and mobile layouts. For overlay work, also verify the exact OBS-style viewport, transparent background, initial load, SSE reconnect, and long localized text. Report checks that could not be run.

## Production Priorities

Use this order when requirements leave room for judgment:

1. Payment and donation correctness, security, tenant isolation, and data durability.
2. Automated tests, structured logging, error monitoring, health checks, backups, and recovery procedures.
3. Reliable onboarding and sandbox-to-live payment setup.
4. Internationalization: locale-aware UI, time zones, currencies, and payment providers beyond ECPay.
5. Accessibility, responsive admin workflows, and robust OBS overlay customization.
6. Billing operations, support tooling, privacy controls, retention, exports, and account deletion.

Before calling the service production-ready, explicitly review duplicate webhook routes, session storage, CSRF protection, rate limits, security headers, database migrations/rollback, dependency vulnerabilities, terms/privacy requirements, and provider-specific legal or regional restrictions.

## Documentation

Keep `README.md` focused on a reproducible local setup and link detailed material from `docs/`. Use UTF-8 and repair visibly corrupted text when touching an affected document. Document operational assumptions and rollback steps with any deployment or schema change. Do not describe roadmap work as shipped functionality.
