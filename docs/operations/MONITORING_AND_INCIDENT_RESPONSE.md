# Monitoring and Incident Response Baseline

Status: updated 2026-07-11. This describes what the current code exposes, how to watch it, and the optional external alert webhook now wired for the signals in [Section 4](#4-alert-signals). No monitoring vendor, on-call rotation, or alert-exercise evidence exists in this repository yet — see [Gaps](#7-gaps-not-yet-built) before treating any of this as fully operating in staging or production. Roadmap authority: [ROADMAP.md](../../ROADMAP.md) P0 "Observable operations".

## 1. Health endpoints (verified in [server.js](../../server.js))

| Endpoint | Line | Auth | Behavior |
|---|---|---|---|
| `GET /health/live` | [server.js:55](../../server.js#L55) | none | Always returns `200 {"status":"ok"}`. Synchronous, no dependency check. Use as a process-liveness probe only (container/orchestrator restart trigger). It cannot detect a broken database or a hung ECPay callback path. |
| `GET /health/ready` | [server.js:56-62](../../server.js#L56) | none | Calls `database.healthCheck()` ([database.js:105-118](../../database.js#L105)). In production (`DATABASE_URL` set), runs `SELECT 1` against Postgres: `200 {"status":"ready","database":"postgresql"}` on success, `503 {"status":"not_ready","database":"postgresql"}` if the query fails or the client reports disconnected. In sandbox/JSON mode it always returns `200 {"status":"ready","database":"json"}` — readiness only carries real signal in production/Postgres mode. |

Both endpoints are unauthenticated by design (used by load balancers/orchestrators) and currently return no sensitive data. Do not add credentials, stack traces, or connection strings to either response.

`requestObservability` middleware ([observability.js](../../observability.js), mounted at [server.js:29](../../server.js#L29)) assigns every request a `crypto.randomUUID()` request ID, exposes it as `req.requestId` and the `X-Request-Id` response header, and logs a structured `http_request_completed` event (method, route label, status code, duration) on `res.finish`. A catch-all Express error-handling middleware at [server.js:2380](../../server.js#L2380) logs `http_unhandled_error` with the request ID and route label and returns a redacted `500` body. Uncaught synchronous errors inside a route without its own `try/catch` reach this handler; there is still no `process.on('uncaughtException', ...)`/`process.on('unhandledRejection', ...)` handler for errors thrown outside the request lifecycle.

## 2. Current logging behavior (verified in code)

- All server.js logging goes through `logInfo`/`logWarn`/`logError` in [observability.js](../../observability.js), which write a single structured JSON line (`timestamp`, `level`, `event`, plus caller-supplied fields) to stdout/stderr via `console.log`/`warn`/`error`. There is no log-level configuration or shipped log-shipping integration, but every call site uses a fixed, non-PII `event` name rather than free-text interpolation.
- The donation webhook handler (`POST /webhook/:slug`, [server.js:900](../../server.js#L900)) never logs the donor's display name, message, or amount — only `event` and `request_id`. The one legacy duplicate handler that used to interpolate the donor name and amount into a log line has been migrated to the same fixed-vocabulary, PII-free events. API error responses no longer echo `error.message` back to the caller either (they return a fixed `internal_error` string), closing the earlier risk of a dependency's error message leaking a secret through an HTTP response. A dedicated audit for secrets embedded in *thrown* `Error` objects from third-party dependencies has still not been done — `logError` calls intentionally do not include the caught error object precisely to avoid that risk, but this has not been exhaustively verified across every dependency.
- Spot-checked `credentials.js`/`config.js` do not log `HashKey`/`HashIV`/session secrets directly — this was not an exhaustive audit.
- No shipped integration with an external log aggregator or error-monitoring vendor: `package.json` has no Sentry/Winston/Pino/Datadog/New Relic/Bugsnag dependency, and `.env.example` has no corresponding configuration keys. Everything below assumes you are watching process logs (now newline-delimited JSON) and polling the health endpoints yourself, or wiring a vendor — it does not assume a vendor is already connected.

## 3. In-app admin notifications are not an alert channel

`broadcastAdminNotification()` ([server.js:402-428](../../server.js#L402)) pushes SSE events (`event: admin-notification`) to whichever browser tabs are currently connected to `GET /events` ([server.js:431](../../server.js#L431), itself gated by `requireActiveSubscription`) for the affected workspace. The donation webhook fires this on merchant-ID mismatch, Data-decryption failure, non-1 `TransCode`, non-1 `RtnCode`, and simulated payments ([server.js:979](../../server.js#L979), [988](../../server.js#L988), [998](../../server.js#L998), [1008](../../server.js#L1008), [1018](../../server.js#L1018)).

This only reaches a human if an admin happens to have the admin/overlay page open at that moment. It has no persistence, no delivery retry, and no path to an on-call channel (email/SMS/Slack/PagerDuty). Do not rely on it for incident detection — use it only as a supplementary in-session signal for a streamer watching their own dashboard live.

## 4. Alert signals

All signals below are defined in terms of HTTP status codes and a small set of fixed-vocabulary event names already present in the code, specifically so an alert payload never needs to carry a raw request/response body, donor PII, or payment credentials. Delivery is described in [Section 4d](#4d-external-alert-delivery-configuration).

### 4a. Readiness failure

- **Source:** `GET /health/ready` returning `503`, or the endpoint timing out / connection refused.
- **What it verifiably means today:** Postgres `SELECT 1` failed, or `database.js`'s client reports itself disconnected ([database.js:108](../../database.js#L108)).
- **Event:** `readiness_check_failed`, fired at [server.js:59-61](../../server.js#L59) whenever `database.healthCheck()` reports not-ok.
- **Redacted alert payload:** `event`, `timestamp`, `request_id`, `route` (`/health/ready`), `status_code` (`503`) only — see [Section 4d](#4d-external-alert-delivery-configuration) for the exact shape. Never forward the response body's `database` field or anything else beyond that.
- **Suggested check:** poll from outside the app process (external uptime probe, or your orchestrator's own readiness probe) every 30-60s; page after 3 consecutive failures (~90-180s) to avoid single-blip pages, in addition to (not instead of) the webhook alert, which fires on every failed check.

### 4b. Callback (payment webhook) failure

Three live payment-callback code paths raise alertable events:
- `POST /webhook/:slug` — per-workspace donation webhook ([server.js:954](../../server.js#L954)): `payment_webhook_invalid_merchant` (400), `payment_webhook_decryption_failed` (400), `payment_webhook_unexpected_error` (500).
- `POST /ecpay/return` — initial subscription authorization callback ([server.js:1309](../../server.js#L1309)): `subscription_initial_callback_failed` (500).
- `POST /ecpay/period/callback` — recurring subscription billing callback ([server.js:1987](../../server.js#L1987)): `subscription_callback_unexpected_error` (500).

All three routes always terminate the request (200/400/404/500) and never throw unhandled past their own `try/catch`. A "not yet paid" or "RtnCode not 1" response is normal ECPay traffic (declined or test transactions) and correctly returns 200 with `1|OK` — those paths are not alertable events (see Section 5, Sev3).

- **Redacted alert payload:** `event`, `timestamp`, `request_id`, `route`, `status_code` only. Never alert with the raw request body — it carries ECPay's encrypted `Data` field and, once decrypted upstream, payer name/amount. `broadcastAdminNotification` (Section 3) separately carries a human-readable, workspace-scoped message for the same failures, but that path is in-app only and not delivered by the webhook.

### 4c. 5xx spike (general) and other unhandled errors

- **Event:** `http_unhandled_error`, fired from the catch-all Express error-handling middleware ([server.js:2380-2385](../../server.js#L2380)) whenever an error reaches it without a response already sent. Covers any route, not just payment callbacks.
- No request-level metrics/rate middleware exists yet, so there is no separate "5 in 5 minutes" threshold alert — each unhandled error sends its own webhook call. If this becomes noisy, add rate limiting to `sendAlert` in `observability.js` rather than suppressing the underlying log.

### 4d. External alert delivery (configuration)

`sendAlert(event, fields, env)` in [observability.js](../../observability.js) is the single delivery path for all signals above:

- **Enable/disable:** set `ALERT_WEBHOOK_URL` (must be `https://` when set — enforced by `validateProductionConfig` in [config.js](../../config.js) for production). Leave it unset to disable delivery entirely; local/sandbox environments work unchanged with no alert URL configured.
- **Fixed vocabulary:** only `readiness_check_failed`, `payment_webhook_invalid_merchant`, `payment_webhook_decryption_failed`, `payment_webhook_unexpected_error`, `subscription_initial_callback_failed`, `subscription_callback_unexpected_error`, and `http_unhandled_error` are ever delivered. Any other event name passed to `sendAlert` is silently dropped before a network call is made.
- **Payload:** a single JSON POST body — `{ "event", "timestamp", "request_id", "route", "status_code" }`. Fields absent from the triggering call site are simply omitted; nothing else is ever added.
- **Timeout and failure behavior:** request is aborted after `ALERT_WEBHOOK_TIMEOUT_MS` (default `3000`ms). A failed or slow delivery is caught internally, logged locally as `alert_delivery_failed`, and never throws, never retries, and never blocks or changes the response already sent to the original caller (the health check or payment callback always completes on its own timeline).
- **Tests:** [test/observability.test.js](../../test/observability.test.js) covers the no-URL no-op case, the fixed-vocabulary gate, payload redaction (unlisted fields such as a donor name or `HashKey` are dropped before serialization), and that delivery failures never reject.

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

- `ALERT_WEBHOOK_URL` delivers a raw JSON POST to one configured HTTPS endpoint (Section 4d) — it is not itself an email/SMS/Slack/PagerDuty integration. Point it at a vendor's inbound-webhook URL (e.g. a Slack incoming webhook or a generic alerting relay) to reach a human channel; none is configured in this repository by default, and no `ALERT_WEBHOOK_URL` value is committed anywhere.
- No monitoring vendor, uptime prober, or log aggregator is integrated (Section 2).
- No on-call rotation or named team owns Sev1/Sev2 response (Section 5) — this needs a real assignment before relying on this document operationally.
- No alert exercise has been run against a real staging or production endpoint yet; the template in [ALERT_EXERCISE_TEMPLATE.md](ALERT_EXERCISE_TEMPLATE.md) is still unused, since it specifically calls for a staging/production environment and this has not been available to any development lane so far. What has been done, on 2026-07-11: a real (unmocked) `sendAlert('readiness_check_failed', ...)` call was fired over an actual loopback HTTP connection to a throwaway local Node listener — not staging, not a vendor endpoint — and separately against a refused local port. This is strictly more than the existing unit tests (`test/observability.test.js`), which stub `global.fetch` and never open a real socket. Confirmed by that run: the POST body received by the listener was exactly `{event, timestamp, request_id, route, status_code}` with no other fields, `Content-Type: application/json` was set, delivery completed in ~30ms, and the refused-connection case was caught and logged as `alert_delivery_failed` without throwing or hanging (~20ms). This rules out a class of bugs (URL/method/header/body-construction mistakes, unhandled promise rejection on connection refusal) that a mocked-fetch unit test cannot catch, but it does **not** prove delivery works against a real internet-routed vendor endpoint (TLS, DNS, firewall/proxy egress rules, the vendor's own payload-shape expectations) — that step still needs a real `ALERT_WEBHOOK_URL` in staging or production and a filled-in `ALERT_EXERCISE_TEMPLATE.md`.
- No rate limiting on alert delivery itself: a sustained failure (e.g. Postgres down) sends one webhook call per failed request, not a debounced/aggregated alert.

Closing these gaps is tracked under ROADMAP.md's P0 "Observable operations" row and action 6 of the "Immediate next 10 actions" list.
