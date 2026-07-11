# Monitoring and Incident Response Baseline

Status: documentation baseline only, written 2026-07-11. This describes what the current code exposes and proposes how to watch it. No external monitoring vendor, alert channel, on-call rotation, or alert-exercise evidence exists in this repository yet — see [Gaps](#7-gaps-not-yet-built) before treating any of this as operating in staging or production. Roadmap authority: [ROADMAP.md](../../ROADMAP.md) P0 "Observable operations".

## 1. Health endpoints (verified in [server.js](../../server.js))

| Endpoint | Line | Auth | Behavior |
|---|---|---|---|
| `GET /health/live` | [server.js:55](../../server.js#L55) | none | Always returns `200 {"status":"ok"}`. Synchronous, no dependency check. Use as a process-liveness probe only (container/orchestrator restart trigger). It cannot detect a broken database or a hung ECPay callback path. |
| `GET /health/ready` | [server.js:56-62](../../server.js#L56) | none | Calls `database.healthCheck()` ([database.js:105-118](../../database.js#L105)). In production (`DATABASE_URL` set), runs `SELECT 1` against Postgres: `200 {"status":"ready","database":"postgresql"}` on success, `503 {"status":"not_ready","database":"postgresql"}` if the query fails or the client reports disconnected. In sandbox/JSON mode it always returns `200 {"status":"ready","database":"json"}` — readiness only carries real signal in production/Postgres mode. |

Both endpoints are unauthenticated by design (used by load balancers/orchestrators) and currently return no sensitive data. Do not add credentials, stack traces, or connection strings to either response.

No request-ID/correlation-ID middleware and no global Express error-handling middleware exist in `server.js` today (verified: no `app.use((err, req, res, next) => ...)`, no `process.on('uncaughtException', ...)` or `process.on('unhandledRejection', ...)`). Uncaught synchronous errors inside a route without its own `try/catch` will produce Express's default error response, not a structured log entry. Treat correlated request logging as a prerequisite the roadmap's "Observable operations" item still needs, not a shipped capability.

## 2. Current logging behavior (verified in code)

- All logging is `console.log` / `console.warn` / `console.error` to stdout/stderr. There is no structured logger, no log-level configuration, and no redaction layer.
- The donation webhook handler logs the donor's display name and amount on success (`console.log` at [server.js:1045-1047](../../server.js#L1045)) and logs the full caught `Error` object on failure (`console.error` at [server.js:1056](../../server.js#L1056)). Error objects/messages surfaced by dependencies have not been audited for embedded secrets. Until that audit happens, treat process stdout/stderr as containing donor PII (names) and treat it accordingly for retention/access, per [AGENTS.md](../../AGENTS.md) "never log ... personal data."
- Spot-checked `credentials.js`/`config.js` do not log `HashKey`/`HashIV`/session secrets directly — this was not an exhaustive audit.
- No shipped integration with an external log aggregator or error-monitoring vendor: `package.json` has no Sentry/Winston/Pino/Datadog/New Relic/Bugsnag dependency, and `.env.example` has no corresponding configuration keys. Everything below assumes you are watching process logs and polling the health endpoints yourself, or wiring a vendor — it does not assume a vendor is already connected.

## 3. In-app admin notifications are not an alert channel

`broadcastAdminNotification()` ([server.js:402-428](../../server.js#L402)) pushes SSE events (`event: admin-notification`) to whichever browser tabs are currently connected to `GET /events` ([server.js:431](../../server.js#L431), itself gated by `requireActiveSubscription`) for the affected workspace. The donation webhook fires this on merchant-ID mismatch, Data-decryption failure, non-1 `TransCode`, non-1 `RtnCode`, and simulated payments ([server.js:979](../../server.js#L979), [988](../../server.js#L988), [998](../../server.js#L998), [1008](../../server.js#L1008), [1018](../../server.js#L1018)).

This only reaches a human if an admin happens to have the admin/overlay page open at that moment. It has no persistence, no delivery retry, and no path to an on-call channel (email/SMS/Slack/PagerDuty). Do not rely on it for incident detection — use it only as a supplementary in-session signal for a streamer watching their own dashboard live.

## 4. Alert signals

All signals below are defined in terms of HTTP status codes and the small set of fixed-vocabulary reason strings already present in the code, specifically so an alert payload never needs to carry a raw request/response body, donor PII, or payment credentials.

### 4a. Readiness failure

- **Source:** `GET /health/ready` returning `503`, or the endpoint timing out / connection refused.
- **What it verifiably means today:** Postgres `SELECT 1` failed, or `database.js`'s client reports itself disconnected ([database.js:108](../../database.js#L108)).
- **Redacted alert payload:** HTTP status code + the response's `database` field only (`"postgresql"` or `"json"`, never free text). Never forward the full response body to a third-party channel beyond that field.
- **Suggested check:** poll from outside the app process (external uptime probe, or your orchestrator's own readiness probe) every 30-60s; page after 3 consecutive failures (~90-180s) to avoid single-blip pages.

### 4b. Callback (payment webhook) failure

Two live payment-callback routes:
- `POST /webhook/:slug` — per-workspace donation webhook ([server.js:957](../../server.js#L957)).
- `POST /ecpay/period/callback` — platform subscription billing callback ([server.js:2026](../../server.js#L2026)).

Both always terminate the request (200/400/404/500) and never throw unhandled. Only 5xx responses and the merchant/signature/decryption-failure paths represent operational problems — a "not yet paid" or "RtnCode not 1" response is normal ECPay traffic (declined or test transactions) and correctly returns 200 with `1|OK`.

- **Redacted signal to alert on:**
  - HTTP `500` from either route — caught exceptions at [server.js:1055-1058](../../server.js#L1055) (`❌ Webhook error:`) and [server.js:2030-2033](../../server.js#L2030) (`Subscription recurring payment callback failed:`).
  - HTTP `400`/`404` on `/webhook/:slug` for merchant-ID mismatch or Data-decryption failure ([server.js:977-1002](../../server.js#L977)) — these usually mean a workspace's stored `HashKey`/`HashIV` no longer matches ECPay, which silently drops that workspace's future donations until fixed.
- **Alert payload:** route name, HTTP status, workspace slug (donation route) or the already-computed `userId` (subscription route — no raw payload), and the enumerated failure reason string already logged (e.g. `"Invalid merchant"`, `"Decryption failed"`, `"Server error"`). These strings contain no secrets. Never alert with the raw request body — it carries ECPay's encrypted `Data` field and, once decrypted upstream, payer name/amount.

### 4c. 5xx spike (general)

No request-level metrics middleware exists yet. Recommended baseline: count 5xx responses per route per minute from the reverse proxy or process-manager access log (or add `express`-level counting if one is introduced later), and alert on a rate threshold — e.g., more than 5 in 5 minutes anywhere, or **any** 5xx on `/webhook/:slug` or `/ecpay/period/callback` given both are money-handling paths (AGENTS.md Production Priority #1).

## 5. Severity and ownership

| Severity | Trigger | Response target | Owner (placeholder — assign before go-live) |
|---|---|---|---|
| Sev1 | `/health/live` unreachable, OR `/health/ready` failing 3+ consecutive checks, OR any 5xx sustained >5 min on `/webhook/:slug` or `/ecpay/period/callback` | Page immediately | On-call engineer — no rotation is defined in this repository; see Gaps |
| Sev2 | Isolated 5xx on a payment callback route (not sustained), or repeated merchant-ID/decryption-failure admin notifications for one workspace | Acknowledge same business day | Workspace/product support — no team defined in this repository; see Gaps |
| Sev3 | Non-1 `TransCode`/`RtnCode` warnings, simulated-payment notices | No action; trend-watch only | N/A |

## 6. First-response steps

1. Confirm scope: `GET /health/live` (process up?) then `GET /health/ready` (database reachable?).
2. Identify the failing route from proxy/process logs (`/webhook/:slug`, `/ecpay/period/callback`, or general 5xx elsewhere) and the exact logged reason string.
3. Check whether a deploy landed immediately before the first failure (correlate by timestamp against your deploy log — none is currently captured in-app).
4. For a readiness failure, check Postgres reachability directly before assuming an application bug; `database.healthCheck()` only reports `ok`/`not_ready`, not the underlying error.
5. For a callback failure tied to one workspace, check that workspace's stored ECPay `HashKey`/`HashIV`/merchant ID in the admin panel rather than reading them from logs (they are never logged, by design — see [credentials.js](../../credentials.js)).
6. For anything touching schema, backup, or restore, defer to [docs/setup/DEPLOYMENT.md](../setup/DEPLOYMENT.md) and the backup/restore procedures owned by the parallel Codex workstream (`operations/`) — do not improvise a restore.
7. Record the incident (timestamps, signal, action taken, resolution) using the template in [ALERT_EXERCISE_TEMPLATE.md](ALERT_EXERCISE_TEMPLATE.md).

## 7. Gaps (not yet built)

Documenting these explicitly so this baseline is not mistaken for a shipped capability:

- No external alert delivery (email/SMS/Slack/PagerDuty/etc.) is wired to any signal above. `broadcastAdminNotification` is in-app/in-session only (Section 3).
- No monitoring vendor, uptime prober, or log aggregator is integrated (Section 2).
- No request-ID/correlation-ID or global error-handling middleware exists (Section 1).
- No on-call rotation or named team owns Sev1/Sev2 response (Section 5) — this needs a real assignment before relying on this document operationally.
- No alert exercise has been run against this baseline yet; the template in [ALERT_EXERCISE_TEMPLATE.md](ALERT_EXERCISE_TEMPLATE.md) is unused until one is.

Closing these gaps is tracked under ROADMAP.md's P0 "Observable operations" row and action 6 of the "Immediate next 10 actions" list.
