# Stage 2: Cloudflare Staging Deployment & Verification Runbook

**Product:** Donatio (斗內條)  
**Staging Domain:** `https://donatio-staging.jjmowlab.com`  
**Production Domain:** `https://donatio.jjmowlab.com`  
**Date:** 2026-08-22  
**Status:** Staging-First Verification Runbook  

---

## 1. Prerequisites Checklist

Before executing this verification checklist, ensure:
- [ ] Cloudflare Worker staging is deployed: `npx wrangler deploy --env staging`
- [ ] Hyperdrive binding `HYPERDRIVE` is configured in `[env.staging.hyperdrive]` and connected to PostgreSQL.
- [ ] Staging secrets (`SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are provisioned via `npx wrangler secret put <KEY> --env staging`.
- [ ] Staging custom domain `donatio-staging.jjmowlab.com` is attached in Cloudflare Worker settings.
- [ ] Database migrations have run against the target PostgreSQL instance (`npm run migrate`).

---

## 2. Automated & HTTP Verification Steps

Use staging URL `https://donatio-staging.jjmowlab.com` (or your staging worker URL).

### Test 1: Health Live Check
Verify that the Cloudflare Worker runtime is active.
```bash
curl -i -s "<STAGING_URL>/health/live"
```
**Pass Criteria:**
- HTTP status `200 OK`
- JSON payload: `{"status":"ok"}`

---

### Test 2: Health Ready & Database Check
Verify that Hyperdrive successfully establishes a connection to PostgreSQL.
```bash
curl -i -s "<STAGING_URL>/health/ready"
```
**Pass Criteria:**
- HTTP status `200 OK`
- JSON payload: `{"status":"ready","database":"postgresql"}`
- Zero database connection errors in Cloudflare Worker logs.

---

### Test 3: Public Pricing Endpoint
Verify that non-secret pricing config is returned.
```bash
curl -i -s "<STAGING_URL>/api/pricing"
```
**Pass Criteria:**
- HTTP status `200 OK`
- JSON payload contains `currency`, `monthlyPrice`, `trialDays`, and `plan: "closed_beta"`.

---

### Test 4: Static Assets & Security Headers
Verify that public assets serve correctly and protected pages remain guarded.
```bash
# Public CSS / JS should succeed
curl -i -s "<STAGING_URL>/style.css" | head -n 10

# Direct access to protected html pages MUST return 404
curl -i -s -o /dev/null -w "%{http_code}\n" "<STAGING_URL>/admin.html"
curl -i -s -o /dev/null -w "%{http_code}\n" "<STAGING_URL>/overlay.html"
curl -i -s -o /dev/null -w "%{http_code}\n" "<STAGING_URL>/donate.html"
```
**Pass Criteria:**
- Public assets return `200 OK`.
- Direct requests to `/admin.html`, `/overlay.html`, `/donate.html` return `404 Not Found`.
- Security headers are present (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`).

---

### Test 5: Real-Time SSE Stream Check
Verify that `/events` opens a long-lived streaming connection.
```bash
curl -N -i "<STAGING_URL>/events?slug=default&source=overlay"
```
**Pass Criteria:**
- HTTP status `200 OK`
- Header: `Content-Type: text/event-stream`
- Header: `Cache-Control: no-cache`
- Initial event delivered: `data: {"title":"斗內目標", ...}`
- Periodic keep-alive event received: `event: ping\ndata: ...`

---

### Test 6: Generic Webhook Revenue Event Ingestion
Verify that Stage 1 Generic Webhook ingestion works under Cloudflare Workers.
```bash
# Replace <WORKSPACE_SLUG> and <WEBHOOK_TOKEN> with actual workspace credentials
curl -i -X POST "<STAGING_URL>/api/webhook/generic/<WORKSPACE_SLUG>" \
  -H "Content-Type: application/json" \
  -H "X-Donatio-Token: <WEBHOOK_TOKEN>" \
  -d '{
    "eventId": "test-staging-run-1",
    "eventType": "donation",
    "amount": { "valueMinor": 30000, "currency": "TWD" },
    "supporter": { "displayName": "Staging Tester" },
    "message": "Cloudflare staging verification event"
  }'
```
**Pass Criteria:**
- HTTP status `200 OK`
- JSON response: `{"success":true,"duplicate":false,"eventId":"test-staging-run-1"}`
- Second execution of the exact same request returns: `{"success":true,"duplicate":true,...}` (Idempotency verified).

---

## 3. Post-Verification Sign-off

When all 6 tests pass against the deployed Cloudflare staging environment:
1. Mark Stage 2 as successfully verified.
2. Proceed to attach custom domain `donatio.jjmowlab.com`.
3. Advance to **Stage 3: The Goal Engine**.
