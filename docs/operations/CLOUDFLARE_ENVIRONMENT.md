# Cloudflare Workers Environment & Secrets Inventory

**Product:** Donatio (斗內條)  
**Production Domain:** `https://donatio.jjmowlab.com`  
**Date:** 2026-08-22  
**Status:** Complete  

---

## 1. Overview

This document defines the complete environment variable and secret inventory for Donatio under Cloudflare Workers, separating runtime variables, encrypted secrets, Hyperdrive bindings, and CLI-only configurations.

---

## 2. Environment Bindings & Secrets Inventory

| Variable / Binding Name | Classification | Target Environment | Purpose / Description | Configured Via |
|---|:---:|:---:|---|:---:|
| **`HYPERDRIVE`** | Hyperdrive Binding | Staging / Production | Edge-accelerated connection pool to PostgreSQL | `wrangler.toml` `[[hyperdrive]]` |
| **`BASE_URL`** | Non-Secret Runtime Variable | Staging / Production | Canonical base URL (`https://donatio.jjmowlab.com` in production) | `wrangler.toml` `[vars]` |
| **`ENVIRONMENT`** | Non-Secret Runtime Variable | Dev / Staging / Prod | Runtime mode (`sandbox`, `staging`, `production`) | `wrangler.toml` `[vars]` |
| **`NODE_ENV`** | Non-Secret Runtime Variable | Staging / Production | Node environment flag (`production`) | `wrangler.toml` `[vars]` |
| **`GOOGLE_CALLBACK_URL`** | Non-Secret Runtime Variable | Staging / Production | Canonical OAuth callback (`https://donatio.jjmowlab.com/api/auth/google/callback`) | `wrangler.toml` `[vars]` |
| **`ECPAY_ENVIRONMENT`** | Non-Secret Runtime Variable | Staging / Production | ECPay gateway mode (`stage` or `production`) | `wrangler.toml` `[vars]` |
| **`SESSION_SECRET`** | Cloudflare Secret | Staging / Production | Cryptographic signing key for session cookies (>=32 chars) | `wrangler secret put SESSION_SECRET` |
| **`CREDENTIAL_ENCRYPTION_KEY`** | Cloudflare Secret | Staging / Production | AES-256-GCM key for encrypting provider keys in DB | `wrangler secret put CREDENTIAL_ENCRYPTION_KEY` |
| **`GOOGLE_CLIENT_ID`** | Cloudflare Secret / Var | Staging / Production | Google OAuth 2.0 Client ID | `wrangler secret put GOOGLE_CLIENT_ID` |
| **`GOOGLE_CLIENT_SECRET`** | Cloudflare Secret | Staging / Production | Google OAuth 2.0 Client Secret | `wrangler secret put GOOGLE_CLIENT_SECRET` |
| **`PLATFORM_ADMIN_EMAILS`** | Non-Secret Runtime Variable | Staging / Production | Comma-separated admin emails allowed into `/platform-admin` | `wrangler.toml` `[vars]` |
| **`BILLING_ECPAY_MERCHANT_ID`** | Cloudflare Secret / Var | Staging / Production | Platform SaaS subscription ECPay Merchant ID (Legacy compatibility) | `wrangler secret put BILLING_ECPAY_MERCHANT_ID` |
| **`BILLING_ECPAY_HASH_KEY`** | Cloudflare Secret | Staging / Production | Platform SaaS subscription ECPay HashKey (Legacy compatibility) | `wrangler secret put BILLING_ECPAY_HASH_KEY` |
| **`BILLING_ECPAY_HASH_IV`** | Cloudflare Secret | Staging / Production | Platform SaaS subscription ECPay HashIV (Legacy compatibility) | `wrangler secret put BILLING_ECPAY_HASH_IV` |
| **`ALERT_WEBHOOK_URL`** | Cloudflare Secret | Optional Staging / Prod | HTTPS webhook for operational alerting | `wrangler secret put ALERT_WEBHOOK_URL` |
| **`DATABASE_URL`** | Local / CLI Only | Local Dev / CI / Migrations | Direct PostgreSQL connection string used by CLI migration & backup scripts | `.env` / CI environment |
| **`DATABASE_CA`** | Local / CLI Only | Optional | Base64-encoded or PEM CA certificate for direct SSL verification in CLI | `.env` / CI environment |
| **`BACKUP_ENCRYPTION_KEY`** | Local / CLI Only | Local / CI Backups | 32-byte base64 key for encrypting database backups | `.env` / CI environment |
| **`PADDLE_*`** | Future Stage 6 Variable | Stage 6 SaaS Billing | Reserved for Stage 6 SaaS billing migration | *Do not configure in Stage 2* |

---

## 3. Secret Provisioning Commands (Wrangler CLI)

```bash
# Provision production secrets into Cloudflare Workers
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY --env production
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
npx wrangler secret put BILLING_ECPAY_MERCHANT_ID --env production
npx wrangler secret put BILLING_ECPAY_HASH_KEY --env production
npx wrangler secret put BILLING_ECPAY_HASH_IV --env production
npx wrangler secret put ALERT_WEBHOOK_URL --env production
```
