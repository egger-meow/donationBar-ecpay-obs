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

- Cycle: `004`
- Integration branch: `multiuser`
- Baseline commit: `91df012`
- State: `active`

### Codex lane A

- Outcome: make recurring subscription callback processing independently testable and prove success, failure, invalid amount, invalid signature, and duplicate callback behavior.
- Owned files: `server.js`, `database.js`, `test/subscription-callback.test.js`, and new focused subscription modules/tests if needed.
- Acceptance criteria: preserve callback signature verification and money validation; make payment persistence and subscription state changes demonstrably idempotent; add sandbox-only automated fixtures with no live credentials; do not weaken workspace or user ownership checks.
- Status: active.

### Claude lane B

- Outcome: add a safe, executable staging preflight command that checks configuration, deployed health endpoints, and optional alert-webhook reachability without sending secrets or changing remote state.
- Owned files: `operations/staging-preflight.js`, `test/staging-preflight.test.js`, `package.json`, `.env.example`, and `docs/operations/` only.
- Acceptance criteria: require an explicit staging base URL; reject non-HTTPS outside sandbox; query only `/health/live` and `/health/ready`; report redacted pass/fail diagnostics; optionally test alert-webhook reachability with a fixed synthetic event only when explicitly enabled; no database writes, payment calls, OAuth calls, or raw secret output; add automated tests and a Conventional Commit.
- Status: queued.

## General prompt for Claude Code

```text
You are a peer engineer in the DonationBar shared-directory workflow on branch multiuser. Read AGENTS.md, ROADMAP.md, and docs/collaboration/CLAUDE_CODE_COWORK.md completely. The Current cycle defines your exact lane ownership and acceptance criteria.

Own the Claude lane end-to-end: inspect relevant code, choose a focused implementation, write or update tests, run the closest verification, inspect your assigned-file diff, stage only your owned files, and create one focused Conventional Commit. Do not edit files outside your ownership, including the cowork bridge. Do not merge, rebase, reset, checkout, switch branches, or stage another lane’s work.

Preserve unrelated changes. Never touch .claude/, db.json.backup, backup files, secrets, live credentials, or customer data. Treat payment, auth, tenant isolation, migration, destructive-operation, money, and logging changes as high risk: validate input, avoid sensitive logs, retain tenant boundaries, and add focused tests.

When done, report: outcome, changed files, verification/results, risks or blockers, and commit SHA. If completion needs an unowned file, external credential, or scope change, stop and report the exact blocker rather than expanding scope.
```
