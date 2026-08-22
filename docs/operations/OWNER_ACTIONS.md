# Repository Owner Operational Actions & Audit

## Scope

This document details all external manual steps, dashboard configuration changes, and operational requirements that cannot be performed directly through code commits.

---

## Stage 1 Audit Status

- **Stage 1 (Universal Revenue Event Core)**: **COMPLETED**
- **External Dashboard Actions Required**: **NONE**
  - Stage 1 operates entirely within the DonationBar backend using standard sandbox/PostgreSQL databases and existing ECPay configurations.
  - The Generic Inbound Webhook generates cryptographic workspace tokens automatically upon first access.
  - No external Twitch developer console, Ko-fi webhook dashboard, or Paddle setup is needed in Stage 1 (deferred to Stages 4 and 5).

---

## Environment Variables & Configuration Inventory

No new mandatory environment variables were introduced in Stage 1. All features function seamlessly with existing variables:

| Variable | Required | Default / Description |
|---|:---:|---|
| `DATABASE_URL` | Optional (Production: Required) | PostgreSQL connection string. When unset, runs in file-backed sandbox JSON mode. |
| `BASE_URL` | Optional | Application public base URL (e.g. `https://donationbar.jjmowlab.com`). |
| `ENVIRONMENT` | Optional | `sandbox` or `production`. |
| `COOKIE_SECRET` | Required in Production | Session secret key. |
| `ALERT_WEBHOOK_URL` | Optional | Slack/Discord webhook for production alerts. |

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
