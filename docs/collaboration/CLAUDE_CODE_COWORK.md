# Codex + Claude Code Cowork Bridge

This tracked document is the coordination bridge between Codex (commander/integrator) and Claude Code (lane B). The agents work in separate Git worktrees. They exchange reviewed commits, never simultaneous uncommitted edits in one directory.

## Operating model

1. Codex selects two independent, balanced jobs from `ROADMAP.md`.
2. Codex records both jobs and exact file ownership in **Active cycle**.
3. Codex works lane A. Claude works lane B in its own worktree and branch.
4. Claude edits only its assigned product files and the **Claude handoff** section of this document.
5. Claude verifies its work, creates one Conventional Commit, records the SHA in **Claude handoff**, and tells the operator the SHA.
6. Codex reviews the diff and verification before cherry-picking. Codex alone integrates into `multiuser`.
7. Codex completes lane A, runs combined verification, updates the cycle, and commits.
8. After both lanes are integrated, Codex compacts context and creates the next cycle.

The bridge file communicates state, but a commit diff and verification output are the evidence. A status of `done` without a commit SHA is not a handoff.

## Worktree setup

Run once from PowerShell:

```powershell
git -C C:\IDEA\donationBar-ecpay-obs worktree add C:\IDEA\donationBar-claude -b claude/cowork multiuser
```

Run Codex in `C:\IDEA\donationBar-ecpay-obs` and Claude Code in `C:\IDEA\donationBar-claude`. Before every new cycle, Codex provides the integration commit SHA. Claude starts its next task only after its branch is updated to that reviewed baseline.

## Safety and ownership rules

- Each lane gets non-overlapping files. If both jobs require one file, run them sequentially.
- Claude may always edit only the **Claude handoff** section in this document for status. Codex does not edit that section while Claude is active.
- Task-specific files are allowed only when listed under Claude lane ownership.
- Claude never merges, rebases, cherry-picks, resets, pushes, or edits the integration worktree.
- Codex reviews every Claude commit before cherry-picking it.
- Preserve unrelated and user-owned changes. Never edit `.claude/`, `db.json.backup`, `*-old-backup.js`, secrets, or live customer data.
- Use one focused Conventional Commit per completed lane: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Payment, authentication, tenant isolation, migrations, and destructive operations require narrow ownership and automated tests.
- If the assignment needs an unowned file or broader authority, stop and record a blocker; do not expand scope silently.

## Active cycle

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

## Prompt for Claude Code

Paste this prompt into Claude Code running in `C:\IDEA\donationBar-claude`:

```text
You are lane B in a two-agent DonationBar productization workflow. Codex is the commander and sole integrator. You work only in this isolated worktree on branch claude/cowork.

First read AGENTS.md, ROADMAP.md, and docs/collaboration/CLAUDE_CODE_COWORK.md completely. The Active cycle in that bridge file is your authoritative assignment and ownership boundary. Code and tests are authoritative for shipped behavior; never describe roadmap work as shipped.

Execute only the current Claude lane B task. In cycle 001 you may create or edit files under docs/operations/ and may update only the “Claude handoff” subsection of docs/collaboration/CLAUDE_CODE_COWORK.md. Do not edit any other file. Inspect application code read-only to verify every route and operational claim.

While working, set your handoff status to active. When complete, run the closest relevant checks, inspect your diff, and update the handoff with summary, changed files, exact verification and results, risks/blockers, and the final commit SHA. Create one focused commit whose message starts with docs:. Do not merge, rebase, cherry-pick, reset, push, or modify Codex’s worktree. Preserve unrelated changes and never touch .claude/, db.json.backup, backup files, secrets, or customer data.

If completion needs an unowned file, conflicting edit, credential, external service, or a scope decision, stop. Record status blocked and the precise need in the Claude handoff instead of expanding scope. Finally report the same handoff and commit SHA to me so I can pass it to Codex for review.
```

For later cycles, Codex updates the Active cycle and gives Claude a refreshed prompt or baseline SHA. Claude must not infer a new assignment from old conversation context.
