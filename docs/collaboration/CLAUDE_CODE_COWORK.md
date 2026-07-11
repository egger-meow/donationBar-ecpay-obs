# Codex + Claude Code Cowork Bridge

Codex and Claude Code are peer engineers sharing the `multiuser` working directory. This document contains only the current cycle. `ROADMAP.md` sets priority; code and tests establish shipped behavior.

## Working agreement

- Codex assigns outcomes, file ownership, and acceptance criteria; each engineer independently designs, implements, verifies, and commits their own lane.
- Lanes must not own overlapping files. If they need the same file, sequence the work.
- Before committing, stage only owned files and check `git status`; never include another lane's changes, `.claude/`, `db.json.backup`, backup files, secrets, or customer data.
- Use one focused Conventional Commit per completed lane: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Neither agent merges, rebases, resets, checks out, switches branches, or stages unowned files.
- A completed handoff reports summary, changed files, verification, risks/blockers, and commit SHA. Codex reviews the diff and runs combined verification before closing the cycle.
- After integration, Codex records the result here, compacts context, and creates the next two non-overlapping lanes.

## Current cycle

- Cycle: `003`
- Integration branch: `multiuser`
- Baseline commit: `973fd16`
- State: `complete`

### Codex lane A

- Outcome: prevent JSON sandbox migrations from silently rewriting already-migrated `db.json` data.
- Owned files: `migrations/migrate.js`, `test/migration-security.test.js`, and new focused migration tests if needed.
- Acceptance criteria: detect the current multi-user JSON shape before rewriting; fail closed with a clear recovery message; preserve the explicit legacy one-time migration path; add automated coverage for both shapes; do not edit backup files.
- Status: done — `a0a2b80 fix: guard sandbox migration against data loss`.

### Claude lane B

- Outcome: turn structured operational events into safe, configurable external alert delivery for staging/production.
- Owned files: `observability.js`, `server.js`, `config.js`, `.env.example`, `test/observability.test.js`, and `docs/operations/` only.
- Acceptance criteria: use an optional configured alert webhook with short timeout and non-blocking failure behavior; send only a fixed/redacted event vocabulary plus request ID/route/status (never raw request data, donor data, credentials, tokens, or stack traces); alert on readiness failure, unhandled 5xx, and payment callback errors; keep local/sandbox behavior usable with no alert URL; add automated tests and document configuration/exercise steps.
- Status: done — `cb62800 feat: deliver redacted operational alerts to an optional webhook`.

### Cycle result

- Review follow-up: `8db8fe2 fix: preserve alert delivery failure event`.
- Combined verification: `npm.cmd test` — 31 passed, 0 failed; `npm.cmd audit --omit=dev --json` — 0 production vulnerabilities (from cycle 002, no dependency changes since).
- Remaining external release gates: provision staging infrastructure; run migration/restore rehearsal; exercise OAuth/ECPay callbacks and alert webhook on staging; complete legal/accounting review.

## General prompt for Claude Code

```text
You are a peer engineer in the DonationBar shared-directory workflow on branch multiuser. Read AGENTS.md, ROADMAP.md, and docs/collaboration/CLAUDE_CODE_COWORK.md completely. The Current cycle defines your exact lane ownership and acceptance criteria.

Own the Claude lane end-to-end: inspect relevant code, choose a focused implementation, write or update tests, run the closest verification, inspect your assigned-file diff, stage only your owned files, and create one focused Conventional Commit. Do not edit files outside your ownership, including the cowork bridge. Do not merge, rebase, reset, checkout, switch branches, or stage another lane’s work.

Preserve unrelated changes. Never touch .claude/, db.json.backup, backup files, secrets, live credentials, or customer data. Treat payment, auth, tenant isolation, migration, destructive-operation, money, and logging changes as high risk: validate input, avoid sensitive logs, retain tenant boundaries, and add focused tests.

When done, report: outcome, changed files, verification/results, risks or blockers, and commit SHA. If completion needs an unowned file, external credential, or scope change, stop and report the exact blocker rather than expanding scope.
```
