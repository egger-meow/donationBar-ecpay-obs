# Repository Owner Operational Actions & Audit

## Scope

This document details all external manual steps, dashboard configuration changes, and operational requirements that cannot be performed directly through code commits.

---

## Stage 1 Audit Status

- **Stage 1 (Universal Revenue Event Core)**: **COMPLETED**
- **External Dashboard Actions Required**: **NONE**
  - Stage 1 operates entirely within the Donatio backend using standard sandbox/PostgreSQL databases and existing ECPay configurations.
  - The Generic Inbound Webhook generates cryptographic workspace tokens automatically upon first access.
  - No external Twitch developer console, Ko-fi webhook dashboard, or Paddle setup is needed in Stage 1 (deferred to Stages 5 and 6).

---

## Stage 2 — Cloudflare Setup

Stage 2 migrates the application runtime to Cloudflare Workers with Hyperdrive PostgreSQL connection acceleration. **Deploy and verify staging first before deploying to production.**

### 1. Cloudflare Account & Worker Setup
1. Log in to your Cloudflare Dashboard.
2. Under **Compute (Workers & Pages)**, select **Workers**.
3. Create/select the Worker named `donatio`.
4. Connect the repository (`egger-meow/donationBar-ecpay-obs`) with branch `multiuser`.

### 2. Hyperdrive Configuration & Database Strategy

Hyperdrive accelerates database queries and pools connections to your PostgreSQL instance.

#### Staging vs. Production Database Strategy:
- **Isolation Recommendation**: While a dedicated PostgreSQL instance is ideal for production, staging and production can initially connect to the same Aiven PostgreSQL cluster using either:
  1. Two separate databases on the same cluster (e.g., `donatio_staging` and `donatio_prod`), or
  2. Two distinct Hyperdrive configurations pointing to your database with separate pooling parameters.
- This provides environment isolation without requiring a separate migration tool or infrastructure overhaul.

#### Provisioning Hyperdrive Bindings:
1. Create the **Staging Hyperdrive config**:
   ```bash
   npx wrangler hyperdrive create donatio-staging-db --connection-string="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
   ```
   Copy the returned ID and put it in `wrangler.toml` under `[[env.staging.hyperdrive]] id = "..."`.

2. Create the **Production Hyperdrive config**:
   ```bash
   npx wrangler hyperdrive create donatio-prod-db --connection-string="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
   ```
   Copy the returned ID and put it in `wrangler.toml` under `[[env.production.hyperdrive]] id = "..."`.

### 3. Staging Secrets Provisioning (Deploy Staging First)
Execute each command in your terminal to set encrypted secrets for **staging**:
```bash
# Session signing key (must be >= 32 characters)
npx wrangler secret put SESSION_SECRET --env staging

# AES-256-GCM encryption key for DB-stored provider credentials (32-byte hex/base64 or phrase)
npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY --env staging

# Google OAuth 2.0 Client Credentials
npx wrangler secret put GOOGLE_CLIENT_ID --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging

# Optional: HTTPS Alert Webhook for operational incident notifications
npx wrangler secret put ALERT_WEBHOOK_URL --env staging
```
> **Note on ECPay in Staging**: You do **NOT** need live ECPay production credentials for staging verification. `ECPAY_ENVIRONMENT=stage` automatically utilizes official ECPay sandbox test parameters.

### 4. Custom Domains Setup

1. **Staging Domain**: `donatio-staging.jjmowlab.com`
   - In Cloudflare Worker dashboard > `donatio` > **Settings** > **Triggers** > **Custom Domains**, add `donatio-staging.jjmowlab.com` (associated with the `donatio-staging` environment).
2. **Production Domain**: `donatio.jjmowlab.com`
   - Add `donatio.jjmowlab.com` (associated with the `donatio-production` environment).

### 5. Google Cloud Console OAuth Configuration
1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Open your OAuth 2.0 Client ID settings.
3. Under **Authorized Redirect URIs**, add both:
   ```text
   https://donatio-staging.jjmowlab.com/api/auth/google/callback
   https://donatio.jjmowlab.com/api/auth/google/callback
   ```
4. Under **Authorized JavaScript Origins**, add:
   ```text
   https://donatio-staging.jjmowlab.com
   https://donatio.jjmowlab.com
   ```
5. Save changes.

### 6. Step-by-Step Deployment Workflow

#### Step A: Run Migrations on PostgreSQL
```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require" npm run migrate
```

#### Step B: Deploy to Staging First
```bash
npx wrangler deploy --env staging
```

#### Step C: Execute Staging Verification Runbook
Follow [`docs/operations/STAGE2_STAGING_VERIFICATION.md`](file:///c:/IDEA/donationBar-ecpay-obs/docs/operations/STAGE2_STAGING_VERIFICATION.md) against `https://donatio-staging.jjmowlab.com`.
Verify:
1. `GET /health/live` returns HTTP 200 `{ status: "ok" }`.
2. `GET /health/ready` returns HTTP 200 `{ status: "ready", storage: "postgresql" }`.
3. Google OAuth login flow works on `https://donatio-staging.jjmowlab.com`.
4. Admin panel (`/admin`) and OBS overlay (`/overlay`) load properly.
5. Inbound Generic Webhook creates events and updates goal progress via SSE.

#### Step D: Deploy to Production (Only After Staging Verification Passes)
1. Provision production secrets:
   ```bash
   npx wrangler secret put SESSION_SECRET --env production
   npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY --env production
   npx wrangler secret put GOOGLE_CLIENT_ID --env production
   npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
   npx wrangler secret put BILLING_ECPAY_MERCHANT_ID --env production
   npx wrangler secret put BILLING_ECPAY_HASH_KEY --env production
   npx wrangler secret put BILLING_ECPAY_HASH_IV --env production
   ```
2. Deploy production worker:
   ```bash
   npx wrangler deploy --env production
   ```

### 7. Database Hosting & Aiven Free Staging Warning
- **Current Database**: Staging operates on Aiven Free PostgreSQL via Hyperdrive.
- **Production Gate**: Aiven Free may sleep after periods of inactivity. **Aiven Free is NOT approved as the permanent public-launch production database.** Before Stage 7 public launch, the production database must be upgraded to an always-available managed PostgreSQL instance (e.g. Paid Aiven, Neon, AWS RDS, Supabase Pro).

---

## Environment Variables & Configuration Inventory

| Variable | Required | Default / Description |
|---|:---:|---|
| `HYPERDRIVE` | Required in Worker | Cloudflare Hyperdrive binding name (`HYPERDRIVE`). |
| `DATABASE_URL` | Required for CLI | Direct PostgreSQL connection string for migrations & backups. |
| `BASE_URL` | Required in Prod | `https://donatio.jjmowlab.com` |
| `ENVIRONMENT` | Optional | `sandbox`, `staging`, or `production`. |
| `SESSION_SECRET` | Required in Prod | Session cryptographic signing key (>=32 chars). |
| `GOOGLE_CALLBACK_URL` | Optional | Defaults to `https://donatio.jjmowlab.com/api/auth/google/callback`. |
| `ALERT_WEBHOOK_URL` | Optional | HTTPS webhook URL for operational alerting. |

---

## Database Migrations Applied

When deploying to PostgreSQL in production or staging, execute:
```bash
npm run migrate
```
This runs:
1. Base schema initialization (`migrations/migrate.js`).
2. Subscription schema (`migrations/run-subscription-migration.js`).
3. Revenue events schema (`migrations/run-revenue-events-migration.js`), creating:
   - Table: `revenue_events`
   - Indexes: `idx_revenue_events_lookup`, `uq_revenue_events_external_id`
   - Workspace column: `generic_webhook_token` on `user_workspaces`
