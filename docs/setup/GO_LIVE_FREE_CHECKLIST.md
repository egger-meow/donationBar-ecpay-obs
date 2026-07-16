# Go-Live Checklist — Free-First, Highest CP值

Goal: get DonationBar from local sandbox to a publicly reachable deployment that one
external streamer can use, **spending NT$0 on infrastructure** until the first paying
streamer proves the product (per [ROADMAP.md](../../ROADMAP.md) section 17). Every
service below has a real free tier as of 2026-07; the only unavoidable cost is ECPay's
per-transaction processing fee on real payments, which is not an infrastructure cost.

## Stage 0 — Local sandbox (no accounts needed)

Works fully offline against `db.json`:

```bash
cp .env.example .env    # keep ENVIRONMENT=sandbox
npm install
npm run dev             # http://localhost:3000
```

Overlay demo without any payment setup: `http://localhost:3000/overlay?test=1`.

## Stage 1 — Accounts to register (all free)

| # | Service | What for | Free tier reality check |
|---|---------|----------|------------------------|
| 1 | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | OAuth 2.0 login (the only auth method) | Free, no card required for OAuth credentials |
| 2 | [Neon](https://neon.tech) | Production PostgreSQL | Free: ~3 GiB storage, persistent (no expiry). Pick region **Singapore (ap-southeast-1)** — lowest latency to Taiwan |
| 3 | [Render](https://render.com) | Node web service hosting | Free: 750 h/month, HTTPS `*.onrender.com` subdomain included. Spins down after 15 min idle (see keep-warm note). Alternative: [Koyeb](https://koyeb.com) (1 free service, 512 MB) |
| 4 | [ECPay 綠界](https://www.ecpay.com.tw) | Payment processing | **Stage testing:** free — use ECPay's published stage test credentials, no application needed (`ECPAY_ENVIRONMENT=stage`). **Production:** registering a 特店 merchant account is free; ECPay takes a per-transaction fee (~2–3% credit card) on real money. Requires Taiwan ID/company + bank account |
| 5 | [UptimeRobot](https://uptimerobot.com) | Monitor `/health/ready` + keep Render warm | Free: 50 monitors, 5-min interval |
| 6 | (later, optional) [Brevo](https://brevo.com) | SMTP for welcome emails | Free: 300 emails/day. App runs fine with SMTP unset |
| 7 | (later, optional) custom domain | Branding | ~US$10/yr — the only paid item, and entirely optional; `*.onrender.com` HTTPS works for OAuth and ECPay callbacks |

Notes:

- **Why Neon and not Render's free Postgres:** Render's free database expires after 90
  days; Neon's does not. Don't put payment data on a database with a countdown timer.
- **Keep-warm:** Render free spins down after 15 min idle and takes 30–50 s to wake —
  that would break the OBS overlay's SSE during a live stream. A 5-minute UptimeRobot
  ping on `/health/live` keeps it warm (750 h/month ≈ one always-on service).
  **Before a real streamer goes live on a real stream, upgrade to Render Starter
  (~US$7/mo)** — that expense is gated on the roadmap's first-streamer proof, not paid
  up front.
- **Two ECPay roles:** the platform's own merchant account collects DonationBar
  *subscription* fees (`BILLING_ECPAY_*`); each streamer connects **their own** ECPay
  merchant in the admin page so donations settle directly to them. For a closed beta
  with stage credentials, one test merchant can play both roles.

## Stage 2 — Environment variables for production

`validateProductionConfig()` in [config.js](../../config.js) hard-fails startup if any
of these is missing or weak. Generate secrets locally, paste into Render's Environment
tab (never commit them):

```bash
# generate once each:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # CREDENTIAL_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # BACKUP_ENCRYPTION_KEY
```

| Variable | Value | Source |
|----------|-------|--------|
| `ENVIRONMENT` | `production` | — |
| `NODE_ENV` | `production` | — |
| `BASE_URL` | `https://<app>.onrender.com` | Render (must be HTTPS) |
| `DATABASE_URL` | `postgres://…` | Neon dashboard → connection string |
| `SESSION_SECRET` | 32+ random chars | generated above |
| `CREDENTIAL_ENCRYPTION_KEY` | base64 32-byte key | generated above |
| `BACKUP_ENCRYPTION_KEY` | base64 32-byte key | generated above (for `npm run backup`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client | Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://<app>.onrender.com/api/auth/google/callback` | must match the redirect URI registered in Google Console |
| `PLATFORM_ADMIN_EMAILS` | your Gmail address | comma-separated |
| `ECPAY_ENVIRONMENT` | `stage` until the real merchant is approved, then `production` | — |
| `BILLING_ECPAY_MERCHANT_ID` / `BILLING_ECPAY_HASH_KEY` / `BILLING_ECPAY_HASH_IV` | stage test credentials first; real 特店 credentials later | ECPay |
| `SUBSCRIPTION_TRIAL_DAYS` / `SUBSCRIPTION_MONTHLY_PRICE` | optional; defaults 30 / 70 | — |
| `ALERT_WEBHOOK_URL` | optional; leave empty to disable | see [MONITORING_AND_INCIDENT_RESPONSE.md](../operations/MONITORING_AND_INCIDENT_RESPONSE.md) |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_DISPLAY_NAME` | used only by `npm run migrate` to seed the initial admin | — |

Deploy sequence on Render: build `npm ci`, pre-deploy `npm run migrate`, start
`npm start`. Health checks: `/health/live` (liveness), `/health/ready` (DB-backed).
After deploy, run `npm run preflight:staging -- --base-url https://<app>.onrender.com`
from your machine (see [STAGING_PREFLIGHT.md](../operations/STAGING_PREFLIGHT.md)).

## Stage 3 — When to start paying (CP值-ordered)

1. **NT$0 / month** — everything above; fine for staging, interviews, and OBS testing.
2. **~US$7 / month (Render Starter)** — the moment a real streamer schedules a real
   stream; removes cold starts that would break overlay SSE mid-broadcast.
3. **~US$10 / year (domain)** — only when branding starts to matter for conversion.
4. Everything else (Neon paid, email volume, monitoring) has no trigger until well past
   the first paying cohort.

## Order of operations

1. Stage 0 locally → confirm `?test=1` overlay in OBS on your own machine.
2. Register accounts 1–3 and 5 → deploy with `ECPAY_ENVIRONMENT=stage` + ECPay stage
   test credentials → run staging preflight → complete a full stage-money
   payment-to-OBS loop on the deployed URL.
3. Apply for the real ECPay 特店 (the only step with external review time — start it
   early, in parallel with everything else).
4. Swap `ECPAY_ENVIRONMENT=production` + real billing credentials → one real NT$
   payment as activation evidence (per ROADMAP.md's production gate) → recruit the
   first external streamer.
