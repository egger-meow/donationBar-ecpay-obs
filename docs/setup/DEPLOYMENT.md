# Production deployment

DonationBar ships as a Node.js service and a production container. PostgreSQL and HTTPS are mandatory in production. The process fails startup when required configuration or PostgreSQL is unavailable; it never falls back to `db.json`.

## Required infrastructure

- A container or Node.js 20 runtime
- PostgreSQL with automated backups and point-in-time recovery where available
- An HTTPS reverse proxy that forwards `X-Forwarded-Proto`
- A public, stable domain for OAuth and ECPay callbacks
- Centralized application logs and an uptime monitor

## Required configuration

Start from `.env.example`. Production requires at least:

```dotenv
NODE_ENV=production
ENVIRONMENT=production
ECPAY_ENVIRONMENT=stage
BASE_URL=https://your-domain.example
DATABASE_URL=postgresql://...
SESSION_SECRET=a-random-secret-at-least-32-characters-long
PLATFORM_ADMIN_EMAILS=owner@example.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://your-domain.example/api/auth/google/callback
BILLING_ECPAY_MERCHANT_ID=...
BILLING_ECPAY_HASH_KEY=...
BILLING_ECPAY_HASH_IV=...
```

Streamer donation merchant credentials are entered per workspace. Never put streamer credentials in the platform billing variables.

## Build and release

```bash
docker build -t donationbar:release .
docker run --rm --env-file .env donationbar:release npm run migrate
docker run --env-file .env -p 3000:3000 donationbar:release
```

Run `npm run migrate` as a release job before switching traffic to the new application version. Do not run multiple migration jobs concurrently.

Configure probes:

- Liveness: `GET /health/live`
- Readiness: `GET /health/ready`

Only readiness checks query PostgreSQL. Remove an instance from traffic whenever readiness returns HTTP 503.

## Provider setup

Register these HTTPS endpoints with the platform billing merchant:

- Initial payment notification: `https://your-domain.example/ecpay/return`
- Recurring payment notification: `https://your-domain.example/ecpay/period/callback`

Set the Google OAuth callback to the exact `GOOGLE_CALLBACK_URL`. Perform the first release with ECPay stage credentials and `ECPAY_ENVIRONMENT=stage`; switch that variable to `production` only after signed callback, duplicate callback, simulated payment, cancellation, and failed-payment tests succeed.

## Backup and rollback

Before every database migration:

1. Create and verify a PostgreSQL snapshot.
2. Record the application image tag and migration commit.
3. Run the migration release job.
4. Verify readiness, login, trial access, subscription checkout, donation checkout, and OBS overlay reconnect.

The current migrations are additive and forward-compatible. Application rollback means redeploying the previous image while leaving the additive schema in place. If a migration causes data corruption, stop writes and restore the pre-migration PostgreSQL snapshot; do not attempt an ad-hoc down migration on live payment data.

## Launch verification

- `npm test` passes and `npm audit --omit=dev` reports no vulnerabilities.
- Production startup fails when PostgreSQL or required secrets are missing.
- Sessions survive application restarts and multiple instances.
- ECPay stage payment activates exactly once; replaying the callback creates no second payment.
- Cancellation succeeds at ECPay before local status changes.
- Trial, paid, cancelled-through-period, and expired access rules are exercised.
- OBS browser source loads with transparency, reconnects after interruption, and handles long localized text.
- Desktop and mobile donation/admin pages are manually checked.
- Alerts exist for readiness failures and recurring callback errors.
