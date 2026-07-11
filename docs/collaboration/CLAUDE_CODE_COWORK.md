# Codex + Claude Code Cowork Bridge

This tracked document is the coordination bridge between Codex (coordinator/integrator) and Claude Code (lane B). Both are peer engineers working in the same `multiuser` directory. Each owns and commits its assigned files; Codex coordinates scope and reviews integration.

## Operating model

1. Codex selects two independent, balanced jobs from `ROADMAP.md`.
2. Codex records both jobs and exact file ownership in **Active cycle**.
3. Codex works lane A. Claude works lane B in the same directory, only in its explicitly owned files.
4. Each agent independently designs, implements, verifies, and commits its owned files with a Conventional Commit.
5. Each agent reports its commit SHA, changed files, checks, and blockers directly to the other.
6. Codex reviews the resulting diff before declaring the cycle integrated; a cherry-pick is unnecessary because both agents share the branch and directory.
7. Codex runs combined verification, updates the cycle, and commits the integration record.
8. After both lanes are integrated, Codex compacts context and creates the next cycle.

The bridge file records assignments; a reviewed diff and verification output are the evidence. A completion report with commit SHA is the handoff.

## Shared-directory setup

Run once from PowerShell:

```powershell
cd C:\IDEA\donationBar-ecpay-obs
```

Open Claude Code Desktop on `C:\IDEA\donationBar-ecpay-obs` using the existing `multiuser` working tree. Claude begins after reading the current Active cycle. Before committing, each agent stages only its owned files and checks `git status` to avoid including the other agent's work.

## Safety and ownership rules

- Each lane gets non-overlapping files. If both jobs require one file, run them sequentially.
- Claude does not edit this bridge file while Codex is updating it; report progress in the Claude conversation. Codex records the integrated status after review.
- Task-specific files are allowed only when listed under Claude lane ownership.
- Each agent may stage and commit only its owned files. Neither agent merges, rebases, resets, checks out, switches branches, or stages unowned files.
- Codex reviews Claude's completed commit before closing the cycle.
- Preserve unrelated and user-owned changes. Never edit `.claude/`, `db.json.backup`, `*-old-backup.js`, secrets, or live customer data.
- Use one focused Conventional Commit per completed lane: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Payment, authentication, tenant isolation, migrations, and destructive operations require narrow ownership and automated tests.
- If the assignment needs an unowned file or broader authority, stop and report a blocker; do not expand scope silently.

## Cycle 001 archive

- Cycle: `001`
- Integration branch: `multiuser`
- Baseline commit: `fc871f9`
- State: `complete`

### Codex lane A

- Task: implement and verify encrypted PostgreSQL backup/restore operations.
- Owned files: `operations/`, `test/postgres-operations.test.js`, `package.json`, `.env.example`, `docs/setup/DEPLOYMENT.md`.
- Status: done.
- Commit: `7487724 feat: add encrypted PostgreSQL recovery tooling`.

### Claude lane B

- Task: create an actionable monitoring and incident-response baseline for production staging, based on current health routes and safe logging behavior.
- Owned files: `docs/operations/` only (new directory/files). Do not edit application code in this cycle.
- Definition of done: document liveness/readiness probes, redacted alert signals for readiness failures/callback failures/5xx spikes, severity and ownership, first-response steps, and an alert exercise evidence template. Verify every named route or behavior against current code.
- Status: done.

### Claude handoff

Claude updates only this subsection while lane B is active.

- Status: done
- Summary: Added a monitoring and incident-response baseline under `docs/operations/`, grounded in read-only verification of `server.js`, `database.js`, `config.js`, `.env.example`, `package.json`, and `test/`. Documents `/health/live` and `/health/ready` behavior, current (unstructured, no redaction layer) console logging, why `broadcastAdminNotification`/SSE is an in-session signal and not an alert channel, redacted alert-signal definitions for readiness failures, `/webhook/:slug` and `/ecpay/period/callback` callback failures, and general 5xx spikes, a severity/ownership table (owners left as explicit placeholders — no rotation exists in the repo), first-response steps, and a reusable alert-exercise evidence template. An explicit "Gaps (not yet built)" section states plainly that no external alert delivery, monitoring vendor, request-ID middleware, on-call rotation, or prior alert exercise exists yet, so the baseline cannot be mistaken for shipped observability.
- Changed files:
  - `docs/operations/MONITORING_AND_INCIDENT_RESPONSE.md` (new)
  - `docs/operations/ALERT_EXERCISE_TEMPLATE.md` (new)
  - `docs/collaboration/CLAUDE_CODE_COWORK.md` (Claude handoff subsection only)
- Verification: Read `server.js` end-to-end for route definitions, health checks (lines 55-62), the donation webhook (957-1059) and subscription callback (2026-2034), `broadcastAdminNotification`/SSE (402-436), and confirmed no global Express error handler or `process.on('uncaughtException'|'unhandledRejection')` exists (grep, no matches). Read `database.js:105-118` for `healthCheck()` semantics (Postgres `SELECT 1` vs. always-ok JSON mode). Read `config.js:9-26` for `validateProductionConfig()`. Grepped `package.json` for monitoring/logging vendors (none) and read `.env.example` (no monitoring env vars). Confirmed `legacyEncryptedSubscriptionCallback` (server.js:2038) is defined but never mounted as a route — dead code, not a live duplicate webhook, so it is described that way rather than as an active alert source. Ran `npm test`: 19/19 pass (baseline unaffected, docs-only change). No lint script exists in this repo (per AGENTS.md/CLAUDE.md), so none was run.
- Risks or blockers: None blocking. Two follow-ups intentionally left as open gaps rather than resolved unilaterally (both require decisions/infrastructure outside `docs/operations/` scope): (1) no on-call rotation/owner names exist in the repo — the severity table uses explicit placeholders; (2) no alert-delivery channel (email/Slack/PagerDuty/etc.) or monitoring vendor is wired up, so today these signals are only visible by watching logs/polling the health endpoints directly, which the doc states rather than assumes away.
- Commit SHA: `a795c1ae00c6837df83fa9574d7ac27eeb64053f`.

### Integration result

- Claude commit reviewed: `a795c1ae00c6837df83fa9574d7ac27eeb64053f` (no conflicts; documentation scope and code claims reviewed).
- Cherry-picked as: `1ca9d24 docs: add monitoring and incident-response operations baseline`.
- Combined verification: `npm.cmd test` — 22 passed, 0 failed on 2026-07-11.
- Next cycle: select two non-overlapping P0 implementation slices after this integration baseline.

## Active cycle

- Cycle: `002`
- Integration branch: `multiuser`
- Baseline commit: `706625c`
- State: `complete`

### Codex lane A

- Task: add safe request correlation and structured operational error logging, including removal of known payment/donor PII from process logs.
- Owned files: `server.js`, `security.js`, `test/security.test.js`, and new focused logging module/tests if needed.
- Status: done.
- Commit: `a281db2 feat: add safe request observability`; `5e6dadf fix: prevent migration credential logging`; `5fb4640 fix: remove hidden subscription upgrade`.

### Claude lane B

- Task: replace the stale migration guide with a UTF-8 production staging migration-and-restore rehearsal runbook grounded in the current `npm run migrate`, encrypted backup/restore commands, and actual migration scripts.
- Owned files: `docs/migration/` only. Do not edit code, package scripts, `.env.example`, or any other documentation.
- Definition of done: clear preflight, backup, migration, verification, restore/rollback decision path, failure stop conditions, evidence checklist, and explicit limitations.
- Status: done.

### Claude handoff

Claude updates only this subsection while lane B is active.

- Status: done
- Summary: Replaced the stale migration guide with a staging migration-and-restore rehearsal runbook and marked the historical summary as archive-only.
- Changed files: `docs/migration/MIGRATION_GUIDE.md`, `docs/migration/MIGRATION_SUMMARY.md`.
- Verification: Reviewed against current migration, backup/restore, configuration, and health-check code; `npm.cmd test` passed 26/26 during Codex review.
- Risks or blockers: Real staging migration and restore evidence remains required; sandbox migration idempotency and dead feedback migration SQL remain open follow-ups.
- Commit SHA: `56fa213 docs: add staging migration rehearsal runbook`.

### Integration result

- Claude commit reviewed: shared-directory handoff reviewed and committed by Codex as `56fa213`.
- Cherry-picked as: not applicable (shared working directory).
- Combined verification: `npm.cmd test` — 26 passed, 0 failed; `npm.cmd audit --omit=dev --json` — 0 production vulnerabilities.
- Next cycle: select two non-overlapping P0 implementation slices after compaction.

## Prompt for Claude Code

Paste this prompt into Claude Code running in `C:\IDEA\donationBar-claude`:

```text
You are lane B in a two-agent DonationBar productization workflow. You and Codex are peer engineers sharing the `multiuser` working directory. Codex coordinates assignments and integration; you independently own implementation quality in your lane.

First read AGENTS.md, ROADMAP.md, and docs/collaboration/CLAUDE_CODE_COWORK.md completely. The Active cycle in that bridge file is your authoritative assignment and ownership boundary. Code and tests are authoritative for shipped behavior; never describe roadmap work as shipped.

Execute only the current Claude lane B task. In cycle 002 you may create or edit files under docs/migration/ only. Do not edit any other file, including the bridge file. Inspect application code read-only to verify every route and operational claim.

Implement the task as you judge best within ownership. Run the closest relevant checks, inspect your assigned-file diff, stage only those files, and create one focused Conventional Commit. Do not merge, rebase, reset, checkout, switch branches, or stage another lane's files. Report summary, changed files, verification/results, risks/blockers, and commit SHA directly to Codex. Preserve unrelated changes and never touch .claude/, db.json.backup, backup files, secrets, or customer data.

If completion needs an unowned file, conflicting edit, credential, external service, or a scope decision, stop and report the precise need to Codex instead of expanding scope.
```

For later cycles, Codex updates the Active cycle and gives Claude a refreshed prompt or baseline SHA. Claude must not infer a new assignment from old conversation context.
