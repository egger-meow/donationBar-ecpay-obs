# Complete Setup Guide

This guide covers two separate paths:

- **Local sandbox** — run the app on your own machine against a local JSON file, for development and testing.
- **Production / staging** — run the app against PostgreSQL on a real domain, for a live streamer to actually use.

Do not mix the two: sandbox configuration (`ENVIRONMENT=sandbox`, no `DATABASE_URL`) is never appropriate for real donations or real viewer data.

Authentication in this codebase is **Google OAuth only**. There is no local username/password signup, login, or password-reset flow — those pages do not exist in [public/](../../public/). This is true in sandbox mode too: `ENVIRONMENT=sandbox` only changes the storage backend (JSON file vs. PostgreSQL), not how you sign in. You need a working Google OAuth client even for local development.

## Prerequisites

- Node.js 18+ (CI uses Node 20).
- A Google Cloud project with an OAuth 2.0 client — see [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md). **This is an external prerequisite you must complete yourself in Google Cloud Console; nothing in this repo can create it for you.**
- For sandbox/local work: nothing else. Donations can be exercised against ECPay's sandbox endpoints once you have a workspace.
- For production/staging: a hosted PostgreSQL database, an HTTPS domain, and ECPay merchant credentials (both a workspace-level donation-collection account and, if you plan to charge for DonationBar itself, a separate billing merchant account). **ECPay merchant approval is an external process with ECPay and is not something this repository can verify or guarantee — treat any given merchant ID as unverified until you have confirmed it directly with ECPay.**

## Path A: Local sandbox setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in local values:

   ```bash
   cp .env.example .env
   ```

3. Set at least the following in `.env` for sandbox use:

   | Variable | Purpose |
   |---|---|
   | `ENVIRONMENT=sandbox` | Uses local `db.json` instead of PostgreSQL. Leave `DATABASE_URL` empty. |
   | `ECPAY_ENVIRONMENT=stage` | Talks to ECPay's sandbox endpoints, not live payment rails. |
   | `SESSION_SECRET` | Any local random string is fine for sandbox; it does not need to meet the production strength check. |
   | `CREDENTIAL_ENCRYPTION_KEY` | Required even in sandbox — workspace ECPay credentials are encrypted at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | From your Google OAuth client. Callback URL should be `http://localhost:3000/api/auth/google/callback` for local work. |
   | `ADMIN_EMAIL` | **Set this to your own real Google account email**, not a placeholder. See step 5. |

4. Run the bundled migrations, which build the schema and bootstrap an initial workspace and admin user from the `ADMIN_*` variables:

   ```bash
   npm run migrate
   ```

5. Start the server and sign in with Google, using the **same Google account email as `ADMIN_EMAIL`**. There is no separate password: the bootstrap admin record is matched by email at OAuth login time, not by a credential you type in.

   ```bash
   npm start
   # or, for auto-restart on file changes:
   npm run dev
   ```

   Visit `http://localhost:3000/login` and continue through Google sign-in.

6. Confirm the server is healthy:

   ```bash
   curl http://localhost:3000/health/live
   curl http://localhost:3000/health/ready
   ```

7. From the admin dashboard, configure workspace-level ECPay sandbox credentials under `/admin/ecpay` (or the equivalent in-app settings screen). These are per-workspace `MERCHANT_ID`/`HASH_KEY`/`HASH_IV` values entered through the UI and encrypted at rest with `CREDENTIAL_ENCRYPTION_KEY` — they are separate from any `MERCHANT_ID`/`HASH_KEY`/`HASH_IV` you set in `.env`, which only acts as a legacy fallback, and are also separate from `BILLING_ECPAY_*` (see below).

8. Open the OBS overlay page for your workspace slug (`/overlay/<slug>`) as a Browser Source to confirm real-time updates work, or append `?test=1` for demo mode without a live donation.

## Path B: Production / staging setup

Production and staging setup — provisioning PostgreSQL, an HTTPS domain, secrets, encrypted backups, migration rehearsal, and the full launch checklist — is documented in detail in [DEPLOYMENT.md](DEPLOYMENT.md). Do not duplicate that process here; follow it directly, including its backup/restore rehearsal and rollback guidance.

Before relying on a deployed environment, run the read-only check described in [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md) (`npm run preflight:staging`). It confirms `/health/live`, `/health/ready`, `/api/pricing`, request IDs, and CSP (and optionally your alert webhook) — it is not a substitute for the payment and callback exercises in DEPLOYMENT.md.

Once an environment is live, verify alerting is actually wired up by following [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md), including a real alert exercise from [ALERT_EXERCISE_TEMPLATE.md](../operations/ALERT_EXERCISE_TEMPLATE.md).

**External/legal prerequisites for production** (not verifiable from this repository — treat as open items until you have your own confirmation):
- ECPay merchant approval for both workspace donation collection and, separately, platform recurring billing if you intend to charge for DonationBar itself (`BILLING_ECPAY_*`).
- A production Google OAuth client authorized for your real domain (see [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)).
- Terms of service, privacy policy, data retention, and tax/e-invoice review appropriate to your jurisdiction.

## Environment variable reference

This mirrors [.env.example](../../.env.example); treat that file as the source of truth if the two ever disagree.

| Variable | Sandbox | Production | Notes |
|---|---|---|---|
| `ENVIRONMENT` | `sandbox` | `production` | Selects JSON (`db.json`) vs. PostgreSQL storage. |
| `DATABASE_URL` | empty | required | Missing in production is a hard startup failure by design. |
| `ECPAY_ENVIRONMENT` | `stage` | `stage` or `production` | Independent from `ENVIRONMENT`/`NODE_ENV`. |
| `BASE_URL` | `http://localhost:3000` | your HTTPS domain | Used to build ECPay callback URLs. |
| `SESSION_SECRET` | any string | 32+ char strong secret | Production start fails on a weak/placeholder value. |
| `CREDENTIAL_ENCRYPTION_KEY` | required | required | Base64 32-byte key encrypting per-workspace ECPay credentials ([credentials.js](../../credentials.js)). |
| `BACKUP_ENCRYPTION_KEY` | optional | required for `npm run backup`/`restore` | Keep separate from the backup files it protects. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | required | required | Google OAuth is the only sign-in method; see [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md). |
| `MERCHANT_ID` / `HASH_KEY` / `HASH_IV` | optional | optional | Legacy fallback only; normal workspace donation credentials are entered per-workspace in the admin UI, not here. |
| `BILLING_ECPAY_MERCHANT_ID` / `_HASH_KEY` / `_HASH_IV` | not applicable | required to charge for DonationBar itself | DonationBar's own recurring subscription billing — a distinct merchant account from any workspace's donation-collection credentials. |
| `SUBSCRIPTION_TRIAL_DAYS` / `SUBSCRIPTION_MONTHLY_PRICE` | optional | set to real values | Controls the platform subscription trial/paywall. |
| `PLATFORM_ADMIN_EMAILS` | optional but recommended | required | Comma-separated emails granted platform-wide admin (`requirePlatformAdmin`), independent from the bootstrap `ADMIN_EMAIL` workspace owner. |
| `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_TIMEOUT_MS` | optional | recommended | Redacted operational alerts for readiness/webhook/5xx failures; see [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md). Must be HTTPS in production. |
| `STAGING_BASE_URL` / `STAGING_PREFLIGHT_CHECK_ALERT_WEBHOOK` / `STAGING_PREFLIGHT_TIMEOUT_MS` | not used by the app | used only by `npm run preflight:staging` | See [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md). |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` | required for bootstrap | required for bootstrap | Read once by `npm run migrate` to create the initial `'default'`-slug workspace and its owner user record, matched to that Google account's email at OAuth login. `ADMIN_PASSWORD` is stored but unused for sign-in since there is no local-password login route. |
| `SMTP_*` / `EMAIL_FROM` | optional | optional | Only used if email notifications are enabled; leave empty to disable. |

## URL structure

Routes are workspace-scoped by `slug`, resolved via `getWorkspaceFromSlug()` in [server.js](../../server.js):

- `/overlay/:slug` — OBS Browser Source page. Also accepts `?fg=`, `?bg=`, `?bar=`, `?bar_light=` color overrides and `?test=1` demo mode.
- `/donate/:slug` — viewer-facing donation page.
- `/webhook/:slug` — ECPay asynchronous payment notification endpoint.
- Routes without a slug fall back to the `'default'` workspace created by `npm run migrate`.

`admin.html`, `donate.html`, and `overlay.html` are only reachable through these authenticated/slugged Express routes; requesting them directly as static files returns 404 by design.

## Troubleshooting

- **Can't sign in**: confirm `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL` are set and the callback URL is registered in Google Cloud Console exactly as configured. There is no password to reset — access is entirely determined by which Google account you use.
- **Bootstrap admin login doesn't work**: `ADMIN_EMAIL` in `.env` must exactly match the Google account email you sign in with; the match happens after migration, not before.
- **`/health/ready` returns a non-`ok` status**: check `database.healthCheck()` — in sandbox this means `db.json` is unreadable/corrupt; in production it means PostgreSQL is unreachable.
- **Webhook/callback failures**: verify the workspace's ECPay `HashKey`/`HashIV` in `/admin/ecpay` match what was registered with ECPay for that merchant, and that `BASE_URL` matches the domain ECPay is configured to call back to.
- **Encrypted credential errors on startup**: `CREDENTIAL_ENCRYPTION_KEY` must be the same key used when the credentials were originally encrypted; a changed key cannot decrypt previously stored values. If migrating from an earlier unencrypted state, run the `encrypt-provider-credentials.js` step of `npm run migrate`.
