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

Stage 2 migrates the production runtime to Cloudflare Workers with Hyperdrive PostgreSQL connection acceleration. Follow these exact steps in your Cloudflare dashboard and terminal:

### 1. Cloudflare Account & Worker Setup
1. Log in to your Cloudflare Dashboard.
2. Under **Compute (Workers & Pages)**, select **Workers**.
3. Create/select the Worker named `donatio`.
4. Connect the repository (`egger-meow/donationBar-ecpay-obs`) with branch `multiuser` (or deploy via Wrangler CLI: `npx wrangler deploy --env production`).

### 2. Hyperdrive Configuration
Hyperdrive accelerates database queries and pools connections to your PostgreSQL instance:
1. Run the following command in your terminal with your real PostgreSQL connection URL:
   ```bash
   npx wrangler hyperdrive create donatio-db --connection-string="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
   ```
2. Copy the resulting `id` and update `wrangler.toml` under `[[hyperdrive]]`:
   ```toml
   [[hyperdrive]]
   binding = "HYPERDRIVE"
   id = "<PASTE_YOUR_HYPERDRIVE_ID_HERE>"
   ```
3. Test connectivity locally:
   ```bash
   npx wrangler dev
   ```

### 3. Production Secrets Provisioning
Execute each command in your terminal to set your encrypted secrets in Cloudflare Workers:
```bash
# Session signing key (must be >= 32 characters)
npx wrangler secret put SESSION_SECRET --env production

# AES-256-GCM encryption key for DB-stored provider credentials
npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY --env production

# Google OAuth 2.0 Client Credentials
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production

# Platform Billing Credentials (ECPay Legacy Compatibility)
npx wrangler secret put BILLING_ECPAY_MERCHANT_ID --env production
npx wrangler secret put BILLING_ECPAY_HASH_KEY --env production
npx wrangler secret put BILLING_ECPAY_HASH_IV --env production

# Optional: HTTPS Alert Webhook for operational incident notifications
npx wrangler secret put ALERT_WEBHOOK_URL --env production
```

### 4. Custom Domain Setup (`donatio.jjmowlab.com`)
1. In the Cloudflare Worker dashboard for `donatio`, navigate to **Settings** > **Triggers** > **Custom Domains**.
2. Add Custom Domain: `donatio.jjmowlab.com`.
3. Cloudflare will automatically provision DNS routing and SSL/TLS certificates.

### 5. Google Cloud Console OAuth Configuration
1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Open your OAuth 2.0 Client ID settings.
3. Under **Authorized Redirect URIs**, add:
   ```text
   https://donatio.jjmowlab.com/api/auth/google/callback
   ```
4. Under **Authorized JavaScript Origins**, add:
   ```text
   https://donatio.jjmowlab.com
   ```
5. Save changes.

### 6. Database Hosting & Aiven Free Staging Warning
- **Current Database**: Staging operates on Aiven Free PostgreSQL via Hyperdrive.
- **Production Gate**: Aiven Free may sleep after periods of inactivity. **Aiven Free is NOT approved as the permanent public-launch production database.** Before Stage 7 public launch, the production database must be upgraded to an always-available managed PostgreSQL instance (e.g. Paid Aiven, Neon, AWS RDS, Supabase Pro).
- **Migrations**: Always run database migrations via CLI prior to deploying:
  ```bash
  npm run migrate
  ```

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
