# Claude Code Cowork Workflow

Codex and Claude Code can work concurrently, but do not share an automatic cowork session. Coordinate through Git. Never run both agents in the same working directory.

## Setup and rules

```powershell
git -C C:\IDEA\donationBar-ecpay-obs worktree add C:\IDEA\donationBar-claude -b claude/onboarding-docs multiuser
```

Open Claude Code in the new worktree. Give each agent non-overlapping files. Claude commits and reports the SHA; Codex reviews and cherry-picks. Use one task and conventional commit per review unit. Never touch unrelated dirty files, backups, secrets, or live credentials. If both tasks need a file, sequence them.

## Prompt for Claude Code

```text
You are lane B in a two-agent DonationBar workflow. Codex owns integration and all payment/auth/database production work. You are in an isolated worktree on branch claude/onboarding-docs.

Read AGENTS.md, CLAUDE.md, ROADMAP.md, docs/next-direction.md, and docs/collaboration/CLAUDE_CODE_COWORK.md. ROADMAP.md owns priorities; code/tests own shipped truth.

Assignment: audit and improve the Traditional Chinese closed-beta onboarding docs and setup checklist only. A Taiwan streamer must understand prerequisites, connect ECPay sandbox, test a donation, add the OBS browser source, verify the first alert, and get support. Check current code and never describe roadmap work as shipped.

You may edit README.md and docs/setup/, or create docs/onboarding/. Do not edit server.js, database.js, config.js, payment/security modules, migrations, tests, public/, ROADMAP.md, docs/next-direction.md, CLAUDE.md, .claude/, db.json.backup, or backups. If code is needed, stop and propose a follow-up.

Preserve unrelated changes. Use UTF-8. Add no secrets/customer data/live credentials. Run relevant checks and npm test if examples depend on routes. Commit with a message beginning docs:. Report summary, changed files, checks/results, risks, and commit SHA. Do not merge or cherry-pick.
```

For later tasks, replace only the assignment and ownership boundary.
