# Staging Preflight Check

Status: added 2026-07-11. `operations/staging-preflight.js` is a read-only, safe-to-run-anytime CLI check against a deployed staging (or production) environment. It is not a load test, a smoke test of business logic, or a substitute for the exercises in [MONITORING_AND_INCIDENT_RESPONSE.md](MONITORING_AND_INCIDENT_RESPONSE.md) — it only confirms the environment is reachable before you rely on it.

## What it does

1. Requires an explicit target: `--base-url <url>` or `STAGING_BASE_URL`. There is no default host, so it can never accidentally run against the wrong environment.
2. Rejects a non-HTTPS base URL unless `ENVIRONMENT=sandbox` is set, matching the sandbox/production distinction used elsewhere in this codebase ([config.js](../../config.js), [database.js](../../database.js)).
3. Sends three read-only `GET` requests: `/health/live`, `/health/ready`, and `/api/pricing`. It also verifies that the live response carries `X-Request-Id` and an enforced `Content-Security-Policy`, and that pricing carries CSP. Nothing else is called — no database, no payment provider, no OAuth endpoint.
4. Optionally, only when explicitly enabled with `--check-alert-webhook` or `STAGING_PREFLIGHT_CHECK_ALERT_WEBHOOK=1`, POSTs one fixed synthetic event (`{"event":"staging_preflight_check","timestamp":"..."}`) to `ALERT_WEBHOOK_URL` to confirm the endpoint is reachable. Skipped by default and skipped (with a reason) if `ALERT_WEBHOOK_URL` is not configured or is not HTTPS.
5. Prints one redacted JSON diagnostic object to stdout and exits `0` on pass, `1` on any failed check.

## What it never does

- No database reads or writes.
- No calls to any payment, subscription, or OAuth route.
- No raw response bodies in the output — the `/health/ready` response is reduced to its `status` and `database` fields only, dropping any other field a future change might add.
- No webhook URLs in the output. Some alert-webhook vendors (e.g. Slack incoming webhooks) embed a secret token in the URL path; the configured `ALERT_WEBHOOK_URL` value is never printed, only whether the reachability check was skipped, passed, or failed.
- No query string or fragment from the base URL in the output (`redactUrl` keeps protocol, host, and path only), in case a base URL is pasted with an embedded token.

## Usage

```bash
# Using environment variables (e.g. from a staging .env)
STAGING_BASE_URL=https://staging.example.com npm run preflight:staging

# Using CLI flags
node operations/staging-preflight.js --base-url https://staging.example.com

# Also check alert-webhook reachability
node operations/staging-preflight.js --base-url https://staging.example.com --check-alert-webhook
```

Example output:

```json
{
  "pass": true,
  "baseUrl": "https://staging.example.com",
  "checks": {
    "live": { "path": "/health/live", "ok": true, "statusCode": 200, "durationMs": 42, "requestIdPresent": true, "contentSecurityPolicyPresent": true },
    "ready": { "path": "/health/ready", "ok": true, "statusCode": 200, "durationMs": 55, "status": "ready", "database": "postgresql" },
    "pricing": { "path": "/api/pricing", "ok": true, "statusCode": 200, "durationMs": 18, "contentSecurityPolicyPresent": true }
  },
  "alertWebhook": null
}
```

## Relationship to the alert exercise template

This check does not replace an [alert exercise](ALERT_EXERCISE_TEMPLATE.md) — it only confirms the target environment and (optionally) the alert webhook endpoint are reachable before you attempt one. It is a reasonable first step before any readiness-failure, callback-failure, or webhook-delivery drill: run it, confirm `pass: true`, then proceed with the actual exercise.

## Tests

[test/staging-preflight.test.js](../../test/staging-preflight.test.js) covers: missing/malformed base URL, the HTTPS-outside-sandbox rejection, that the three read-only endpoints are called by default, request-ID/CSP header failures, pass/fail reporting for a `503` readiness response, that the alert-webhook check is skipped unless explicitly enabled, and that the webhook URL never appears in returned diagnostics.
