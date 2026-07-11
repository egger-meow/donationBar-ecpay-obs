# Production Staging Migration and Restore Rehearsal Runbook

This replaces the previous single-user-to-multi-user `MIGRATION_GUIDE.md`. That guide described a one-time 2024 schema conversion that has already shipped; its command examples (dropping `app_data`/`donations_old`, "next steps: update server.js") no longer match the current codebase and are removed rather than repeated here. `docs/migration/MIGRATION_SUMMARY.md` is that same historical record and is now out of date for the same reason — treat it as archive only, not as instructions.

This document is the runbook for rehearsing `npm run migrate` and the encrypted backup/restore cycle against an **isolated staging PostgreSQL database** before every schema-changing release, per [ROADMAP.md](../../ROADMAP.md) section 17 action 2 ("Run migrations; rehearse documented rollback and full restore") and the [Deployment Guide](../setup/DEPLOYMENT.md) backup/rollback sections. It does not cover the JSON sandbox path in depth — see the sandbox warning in Limitations below before ever running `npm run migrate` with `ENVIRONMENT=sandbox` more than once against real data.

All commands below assume PowerShell in the project root on a machine with `pg_dump`/`pg_restore` installed (same major version family as the target PostgreSQL server) and Node.js 18+.

## 1. Preflight checklist

Confirm every item before touching the staging database:

- [ ] Target is an **isolated staging PostgreSQL instance**, never the production database and never a database you cannot safely drop afterward.
- [ ] `DATABASE_URL` in the operator's shell/`.env` points at that staging instance only — read it back and confirm the host/database name before running anything.
- [ ] `ENVIRONMENT` is **not** set to `sandbox` (that switches `npm run migrate` to the JSON-file code path instead of PostgreSQL — see [database.js](../../database.js)).
- [ ] If the staging provider requires TLS, `DATABASE_URL` includes `sslmode=require` (or the provider's equivalent). `operations/postgres-backup.js` and `operations/postgres-restore.js` invoke the `pg_dump`/`pg_restore` binaries directly with `--dbname <DATABASE_URL>`, so they rely on libpq parsing SSL parameters out of the URL itself — they do not go through [database-ssl.js](../../database-ssl.js), which only covers the Node `pg` client used by the migration scripts.
- [ ] `BACKUP_ENCRYPTION_KEY` is a base64-encoded 32-byte key present in the operator's environment and recorded in the secret vault, per `.env.example`. `operations/postgres-backup.js` throws immediately if it is missing or the wrong length.
- [ ] `CREDENTIAL_ENCRYPTION_KEY` is set and matches the key already used to encrypt any existing `payment_providers` rows in that staging database — a mismatched key makes `decryptCredential()` (see [credentials.js](../../credentials.js)) throw at runtime, not at migration time.
- [ ] `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` are set to disposable staging-only values and recorded in the operator's secret manager before running the migration — `migrate.js` bcrypt-hashes the password into the database and no longer echoes it to the console (see Limitations, "Resolved" note).
- [ ] `pg_dump --version` and `pg_restore --version` succeed and are compatible with the staging server version.
- [ ] The output path for the backup file is on a volume the operator controls, and the exact filename does not already exist (`postgres-backup.js` opens the file with the `wx` flag and refuses to overwrite).
- [ ] `npm test` passes on the commit being rehearsed (baseline confidence before altering staging state).

## 2. Backup (before every migration attempt)

```powershell
node operations/postgres-backup.js "backups/donationbar-staging-$(Get-Date -Format yyyyMMdd-HHmmss).dump.enc"
```

(or `npm run backup -- <path>`, which passes the path through identically). This streams `pg_dump --format=custom --no-owner --no-acl` through AES-256-GCM encryption keyed by `BACKUP_ENCRYPTION_KEY`, prefixed with a version header and IV, suffixed with the auth tag ([operations/postgres-backup.js](../../operations/postgres-backup.js)). Confirm the command printed `Encrypted PostgreSQL backup created: <path>` and that the file exists and is non-empty before proceeding. If it fails partway, the script removes the partial output file itself — do not proceed on a partial file if it somehow remains.

Record the backup file path and its size in the evidence checklist (Section 7) before continuing.

## 3. Run the migration

```powershell
npm run migrate
```

This runs four scripts in sequence (`package.json`), and the whole chain stops at the first failure (`&&`):

1. **`migrations/migrate.js`** — the original base-schema migration. Against PostgreSQL it checks whether the `users` table already exists; if so it rolls back and exits without making changes (already-migrated staging databases are safe to re-run against). If `users` does not exist, it creates all core tables (`users`, `subscriptions`, `user_workspaces`, `workspace_settings`, `payment_providers`, `donations`, `api_keys`, `audit_logs`, `fraud_prevention`, `feedback`) inside one transaction, migrates any legacy `app_data`/`donations` rows into the new schema, creates one admin user from `ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD`, and drops the old `app_data`/`donations_old` tables. **This script only ever runs its migration once per database** — it is not designed to be re-applied after schema drift; do not treat a clean second run as proof the migration is idempotent for content changes, only that it will not error.
2. **`migrations/run-subscription-migration.js`** — applies `migrations/add-subscription-payment-system.sql` (adds ECPay tracking columns to `subscriptions`, creates `payment_history`, creates the `subscription_overview` view). It checks for the `ecpay_merchant_trade_no` column first and skips with a message if already applied. The SQL itself uses `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so it is safe to re-run.
3. **`migrations/run-payment-idempotency-migration.js`** — applies `migrations/20260711-fix-payment-idempotency.sql` (drops the old unique constraint on `payment_history.ecpay_trade_no` and replaces it with a partial unique index that ignores `NULL`). The index is created with `IF NOT EXISTS`, so re-running is safe.
4. **`migrations/encrypt-provider-credentials.js`** — locks and scans every `payment_providers` row; any `merchant_id`/`hash_key`/`hash_iv` value not already in the `enc:v1:` envelope format is encrypted with `CREDENTIAL_ENCRYPTION_KEY`. Rows already encrypted are left untouched, so re-running is safe **as long as `CREDENTIAL_ENCRYPTION_KEY` has not changed** since the previous run — see [credentials.js](../../credentials.js) `isEncryptedCredential`/`encryptCredential`.

Net effect: for a staging PostgreSQL database, re-running `npm run migrate` after a successful run is safe (steps 1 skips entirely, steps 2–4 are idempotent). Capture the full console output for the evidence checklist; it no longer contains the admin password (see Limitations, "Resolved" note), but still redact `DATABASE_URL`/hostnames if the connection string was echoed by any wrapper script before storing output anywhere outside a local secret vault.

`migrations/add-feedback-table.sql` exists in the `migrations/` directory but is **not** referenced by `npm run migrate` or by any script in `package.json` — step 1 already creates `feedback` inline. Do not run it manually; it is dead/duplicate SQL, not an undocumented required step. Flag its removal to Codex/a later cycle rather than deleting it in this doc-only lane.

## 4. Verification

After migration completes, before declaring the rehearsal a pass:

- [ ] `GET /health/ready` on the staging instance returns HTTP 200 with `"database": "postgresql"` (see `server.js` health routes, backed by `database.js` `healthCheck()`, which runs `SELECT 1`).
- [ ] `psql "$DATABASE_URL" -c "\dt"` shows `users`, `subscriptions`, `user_workspaces`, `workspace_settings`, `payment_providers`, `donations`, `api_keys`, `audit_logs`, `fraud_prevention`, `feedback`, `payment_history`, and no leftover `app_data`/`donations_old`.
- [ ] `SELECT ecpay_merchant_trade_no, last_payment_status, grace_period_end_at FROM subscriptions LIMIT 1;` succeeds (confirms step 2 columns exist).
- [ ] `SELECT indexname FROM pg_indexes WHERE tablename = 'payment_history' AND indexname = 'uq_payment_history_ecpay_trade_no';` returns one row (confirms step 3).
- [ ] `SELECT merchant_id FROM payment_providers LIMIT 5;` — every non-empty value starts with `enc:v1:` (confirms step 4; do not print decrypted values).
- [ ] One redacted `SELECT` against `user_workspaces` and `donations` shows expected row counts relative to the pre-migration backup (spot-check, not a full diff).
- [ ] Log in through Google OAuth against the staging domain and confirm the created admin account is reachable via `requirePlatformAdmin` if `ADMIN_EMAIL` was added to staging `PLATFORM_ADMIN_EMAILS`; otherwise confirm the row exists in `users` without attempting a login that isn't wired up.
- [ ] `npm test` still passes (it does not touch the staging database, but confirms the code under rehearsal is the code that produced these results).

## 5. Restore / rollback decision path

There is no automated rollback script — `AGENTS.md`/`CLAUDE.md` state this explicitly, and no `migrate:rollback` entry exists in `package.json`. All four migration scripts above are additive (new tables/columns/indexes); none drop or narrow existing columns except step 1's one-time drop of the legacy `app_data`/`donations_old` tables during the original bootstrap.

Decision path if verification (Section 4) fails or migration errors mid-run:

1. **If `npm run migrate` fails before COMMIT** (step 1's `migratePostgreSQL` wraps its work in one transaction and rolls back on error; steps 2–4 are single-statement/idempotent so a failure there generally leaves prior state intact) — read the printed error, fix the root cause (missing extension, permissions, connectivity), and re-run `npm run migrate` from Section 3. Re-running is safe per the idempotency notes above.
2. **If verification fails after a reported success** (data looks wrong, counts don't match, encrypted values are missing) — stop making further writes to the staging database immediately. Do not attempt an ad-hoc manual `ALTER`/`UPDATE` to patch it live.
3. **Restore from the Section 2 backup:**
   ```powershell
   $env:ALLOW_DATABASE_RESTORE = "yes"
   node operations/postgres-restore.js "backups/donationbar-staging-<timestamp>.dump.enc"
   ```
   (or `npm run restore -- <path>`). This is deliberately gated behind `ALLOW_DATABASE_RESTORE=yes` because it runs `pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error`, which drops and recreates objects in the target database ([operations/postgres-restore.js](../../operations/postgres-restore.js)). It authenticates the full encrypted backup (AES-256-GCM auth tag) before invoking `pg_restore`, so a wrong `BACKUP_ENCRYPTION_KEY` or a corrupted/tampered file fails closed before any destructive command runs.
4. **Re-verify** with the Section 4 checklist against the restored database before re-attempting the migration.
5. **If restore itself fails or the backup cannot be authenticated** — this is the hard stop condition. Do not attempt to reconstruct data by hand from application logs. Escalate: the rehearsal has failed, the release does not proceed, and the backup/restore path itself needs investigation (wrong key, corrupted file, `pg_restore` version mismatch) before it can be trusted for a real incident.

Production rollback (per [Deployment Guide](../setup/DEPLOYMENT.md)) means redeploying the previous application image while leaving the additive schema in place — never a live down-migration against real payment data. This staging rehearsal exists specifically to prove the migration/backup/restore sequence works *before* it is ever needed against production.

## 6. Failure stop conditions

Stop and do not proceed past the listed step if any of the following occur:

| Condition | Stop at | Required action |
|---|---|---|
| `DATABASE_URL` cannot be confirmed as the staging instance | Preflight | Do not run any command. Resolve the correct connection string first. |
| `operations/postgres-backup.js` exits non-zero or the output file is missing/empty | Section 2 | Do not run `npm run migrate`. Fix the backup path/key/connectivity and retry the backup. |
| `npm run migrate` exits non-zero | Section 3 | Do not run verification as if it succeeded. Follow Section 5, item 1. |
| Any Section 4 verification check fails | Section 4 | Stop writes. Follow Section 5, items 2–4. |
| `operations/postgres-restore.js` exits non-zero, including auth-tag/format failures | Section 5 | Hard stop per Section 5, item 5. Escalate — do not attempt manual recovery. |
| `CREDENTIAL_ENCRYPTION_KEY` differs from the key used on a previous run against the same staging data | Preflight/Section 3 | Do not run step 4 of the migration; decrypting existing rows will fail later with a mismatched key. Confirm the correct key from the secret vault first. |

## 7. Evidence checklist

Fill in one copy per rehearsal. Store filled-in copies outside this repository if they contain real hostnames or connection strings — redact those before saving anywhere shared, matching the redaction discipline in [docs/operations/ALERT_EXERCISE_TEMPLATE.md](../operations/ALERT_EXERCISE_TEMPLATE.md).

- **Date/time (UTC):**
- **Operator:**
- **Staging database identity (host/database name, not full credentials):**
- **Commit/branch under rehearsal:**
- **Backup file path and size (Section 2):**
- **`npm run migrate` exit code and redacted console output (Section 3):**
- **Verification checklist results (Section 4), pass/fail per item:**
- **Restore rehearsed this cycle? (yes/no) — if yes, restore file, exit code, re-verification result (Section 5):**
- **Total duration (backup → migrate → verify, and separately restore → re-verify if performed):**
- **Result:** pass / fail / partial (explain)
- **Follow-up actions filed (link):**

No rehearsal evidence exists in this repository as of 2026-07-11; this runbook is unexercised until the first filled-in copy is produced and reviewed.

## 8. Explicit limitations and known open issues

- **No automated rollback tooling exists.** `package.json` has no `migrate:rollback` script despite the name appearing in some historical docs/comments elsewhere in the repo. Rollback is "restore the pre-migration backup" (Section 5), not a reverse migration.
- **Resolved during this cycle, verify it stays fixed:** `migrations/migrate.js` previously printed the admin email/username/password to stdout in both the PostgreSQL and JSON-sandbox code paths. That was fixed in commit `5e6dadf` ("fix: prevent migration credential logging"), landed concurrently with this documentation lane: both `console.log` calls now print `Admin user created. Sign in with the credentials stored in your secret manager.` instead of the credential values, and `test/migration-security.test.js` asserts the source never logs `adminEmail`/`adminUsername`/`adminPassword` directly. Re-confirm this test still passes (`npm test`) before trusting console output from a migration run as safe to store; if the assertion or the log lines regress, treat it as a failure stop condition and do not paste migration console output into shared evidence.
- **Legal/data baseline is in progress, not complete.** `public/privacy.html` and `public/terms.html` now exist (added alongside the migration hardening in commit `653425c`), but that is a published-pages checkpoint, not confirmation that the full Taiwan legal/accounting review (retention, tax/e-invoice, merchant eligibility — [ROADMAP.md](../../ROADMAP.md) action 7) is complete. Do not treat the existence of these pages as clearance to rehearse against real customer data.
- **The JSON-sandbox path of `migrations/migrate.js` (`ENVIRONMENT=sandbox`) is not idempotent and is not covered by this runbook's rehearsal procedure.** `migrateSandbox()` unconditionally rewrites `db.json` from the *old* single-user field names (`oldData.goal`, `oldData.total`, `oldData.donations[].payer`) every time it runs and `db.json` exists — it does not detect that `db.json` is already in the new multi-user shape. Running `npm run migrate` a second time with `ENVIRONMENT=sandbox` against an already-migrated `db.json` will silently reset goal settings to defaults and drop donor names (the new shape's `payerName` field is not read by the old-shape mapping, which looks for `.payer`). This is a real data-loss footgun in local/dev use, separate from the production staging rehearsal this document targets; it is verified by reading `migrations/migrate.js` lines under `migrateSandbox()`, not run against real data as part of this cycle.
- **`migrations/add-feedback-table.sql` is dead code relative to `npm run migrate`** — it duplicates the inline `CREATE TABLE feedback` in `migrate.js` step 1 and is not invoked by any script in `package.json`. Noted here so it is not mistaken for a required manual step; not removed in this cycle (out of `docs/migration/` scope).
- **This runbook has not yet been exercised against a real staging PostgreSQL instance** as part of this cycle — no hosted staging Postgres, domain, or provider sandbox was available to this lane (`docs/migration/` is a documentation-only ownership boundary; no infrastructure access was in scope). Every command and script behavior above was verified by reading `migrations/*.js`, `operations/postgres-*.js`, `database.js`, `credentials.js`, `database-ssl.js`, `server.js` health routes, `config.js`, `package.json`, and `test/postgres-operations.test.js`, not by running them against a live database. The Section 7 evidence checklist is unfilled until an operator with staging access runs the actual rehearsal.
- **Retention/export scope:** this document does not cover data retention, export, or deletion obligations for donor/user data touched during a rehearsal. It assumes staging data is synthetic or already-authorized test data, not a live copy of real customer data.
