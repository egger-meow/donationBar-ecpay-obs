# Progress Log

This is the single running record of what has actually shipped. It replaces the old
pattern of one-off `*_SUMMARY.md` / `*_UPDATE.md` docs that used to accumulate under
`docs/development/` and `docs/features/` — those described features (local-password
signup/reset, an early single-tenant webhook) that no longer exist in the code and were
removed rather than left to mislead readers (see the 2026-07-11 entry below).

**Rules for this file:** append new entries at the top, newest first. Never edit or
delete a past entry — if something it describes later changes or turns out wrong, say so
in a new entry instead. This file records *what happened*; it is not a priority list.
For what's next, see [ROADMAP.md](../ROADMAP.md), whose priority tables get edited in
place as work completes or priorities shift.

---

## 2026-07-11 — Real (unmocked) local alert-delivery exercise

Ran `sendAlert('readiness_check_failed', ...)` from `observability.js` for real, twice,
outside the test suite: once against a throwaway local Node HTTP listener on loopback,
once against a refused local port. This is the first time this code path has opened a
real socket — every existing test (`test/observability.test.js`) stubs `global.fetch`.
Confirmed: the delivered POST body was exactly `{event, timestamp, request_id, route,
status_code}` (no PII, no credentials) with `Content-Type: application/json`, delivery
completed in ~30ms; the refused-connection case was caught, logged as
`alert_delivery_failed`, and did not throw or hang (~20ms). Documented in
[docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md](operations/MONITORING_AND_INCIDENT_RESPONSE.md)
Section 7 with an explicit caveat: this is **not** a staging/production exercise — no
real vendor endpoint, TLS, DNS, or egress path was involved — so
`ALERT_EXERCISE_TEMPLATE.md` is still unfilled and that gate is still open. It only rules
out a class of bugs a mocked-fetch test can't catch (URL/method/header/body construction,
unhandled rejection on connection refusal).

Also attempted a local rehearsal of `npm run migrate` / backup / restore against a real
PostgreSQL instance per `docs/migration/MIGRATION_GUIDE.md` (the P0 "Staging release
proof" gap). Blocked: this machine has neither Docker nor a local PostgreSQL install, and
installing either modifies the system, so it needs the user's explicit go-ahead first —
not attempted without asking. Real staging Postgres, a domain, Google OAuth production
credentials, an approved ECPay merchant account, and Taiwan legal/accounting review
remain blocked on the user's own action (see the current-status report delivered this
session) — none of those can be provisioned, paid for, or professionally reviewed by an
autonomous coding agent.

## 2026-07-11 — Observability cleanup, doc corrections, repo tidy-up

- Finished migrating `server.js`'s remaining `console.log`/`warn`/`error` calls to
  structured `logInfo`/`logWarn`/`logError` ([observability.js](../observability.js));
  removed `error.message` echoing from API error responses. Completes the P0
  "Observable operations" roadmap row for the logging half of that work.
- Corrected stale documentation that no longer matched the code:
  [docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md](operations/MONITORING_AND_INCIDENT_RESPONSE.md)
  had said "all logging is `console.log`, no structured logger" and described donor-PII
  logging that had already been removed; [AGENTS.md](../AGENTS.md) had said no tests
  existed (46 exist); [ROADMAP.md](../ROADMAP.md)'s status line had a stale test count
  (19 → 46) and was missing several shipped items (structured logging/alerting, staging
  preflight, recurring-subscription callback tests).
- Surveyed the Traditional Chinese activation path end to end (signup → workspace →
  ECPay config → OBS URL → test donation → live alert) and fixed what it found: the
  donor-anonymity fallback in `server.js` (5 call sites) sent the English word
  `'Anonymous'` all the way to the live OBS overlay instead of `'匿名'`, because the
  server-sent value was already truthy and never reached `overlay.html`'s client-side
  `donor || '匿名'` fallback; `admin.html`/`donate.html` had English `<title>`/`<h1>`
  text and English `showAlert`/`confirm` strings in the subscription-management panel;
  `admin.html`'s cancel/pause-subscription handlers had dead, unreachable `confirm()`
  code left over from an unfinished localization pass (deleted, and the real zh-TW
  confirmation text moved into the live `cancelSubscription()` path); and
  `docs/subscription/ECPAY_SETUP_CHECKLIST.md` referenced a hardcoded `server.js` line
  for the stage/production ECPay switch that was replaced by the `ECPAY_ENVIRONMENT` env
  var months ago, and conflated workspace ECPay credentials with the platform's own
  `BILLING_ECPAY_*` billing credentials — both corrected. Not fixed, and explicitly
  out of scope for a repair: no onboarding-checklist or activation-funnel tracking UI
  exists anywhere in the app. That's real net-new P1 work (roadmap "Guided activation"),
  not a repair.
- Removed five docs describing functionality that no longer exists in the codebase —
  `docs/development/CHANGES_SUMMARY.md`, `docs/development/SERVER_UPDATE_SUMMARY.md`,
  `docs/features/ADMIN_PANEL_UPDATE.md`, `docs/features/AUTH_FEATURES_SUMMARY.md`,
  `docs/features/AUTH_PAGES_STYLING_UPDATE.md`. All five documented a local-password
  signup/forgot-password/reset-password flow (`signup.html`, `forgot-password.html`,
  `reset-password.html`) and an early single-tenant `/webhook/ecpay` design; none of
  those pages exist in `public/` today — auth is Google OAuth-only (see
  `docs/setup/COMPLETE_SETUP_GUIDE.md`, rewritten for this earlier in the same day) and
  the webhook is workspace-scoped (`/webhook/:slug`). Kept as history in the "Project
  history" section below instead of as live docs, since a reader following them today
  would be sent looking for pages and code paths that don't exist.
- Rewrote `docs/README.md`'s index to drop links to the removed docs and to a
  `docs/collaboration/CLAUDE_CODE_COWORK.md` file that `docs/README.md` and
  `docs/next-direction.md` both referenced but was never actually committed (a leftover
  from an untracked local cowork-coordination file used in an earlier session).

## Project history (reconstructed from commit history and now-removed docs, not a live entry)

- **2025-09 to 2025-11 — single-tenant MVP.** ECPay checkout + webhook, admin login,
  overlay, initial `/webhook/ecpay` with AES-128-CBC `Data` decryption, local
  username/password admin auth.
- **2025-11 — multi-tenant rewrite.** Workspace-scoped routes and database schema,
  Google OAuth login, per-workspace ECPay credential storage, SSE reliability
  improvements, trial-abuse prevention. A short-lived local-password
  signup/forgot-password/reset-password flow (email verification via `email.js`/SMTP)
  was built during this phase and later removed in favor of OAuth-only auth — this is
  the flow the five docs removed in the entry above described.
- **2025-12 to 2026-02 — subscription billing.** Recurring ECPay billing, payment
  history tracking, admin panel goal management, PostgreSQL SSL/CA hardening.
- **2026-07-11 — production-hardening pass (single day, per commit history).** Encrypted
  tenant payment credentials, OAuth state validation, strict money/input validation,
  protected static-page bypass fix, legal policy pages, CI release verification,
  encrypted PostgreSQL backup/restore tooling, structured observability plus an optional
  alert webhook, a staging-preflight CLI check, recurring-subscription callback test
  coverage, and the cleanup entry above.
