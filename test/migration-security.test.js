import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertLegacySingleUserSandboxData, isLegacySingleUserSandboxData, isMultiUserSandboxData } from '../migrations/sandbox-shape.js';

test('migration script never prints configured administrator credentials', async () => {
  const source = await readFile(new URL('../migrations/migrate.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.log\([^\r\n]*adminEmail/);
  assert.doesNotMatch(source, /console\.log\([^\r\n]*adminUsername/);
  assert.doesNotMatch(source, /console\.log\([^\r\n]*adminPassword/);
});

test('migrate.js checks app_data exists before querying it, so a brand-new PostgreSQL database can bootstrap', async () => {
  const source = await readFile(new URL('../migrations/migrate.js', import.meta.url), 'utf8');
  // Regression test: a fresh database (no legacy single-user schema ever applied) has no
  // app_data table at all. An unconditional `SELECT * FROM app_data` throws
  // "relation app_data does not exist" and aborts the whole migration transaction,
  // rolling back every table just created. Verified against a real local PostgreSQL 17
  // instance on 2026-07-11 (docs/PROGRESS.md) before this guard was added.
  const appDataQueryIndex = source.indexOf("FROM app_data WHERE id = 'main'");
  assert.notEqual(appDataQueryIndex, -1, 'expected the app_data migration query to still exist');
  const before = source.slice(Math.max(0, appDataQueryIndex - 400), appDataQueryIndex);
  assert.match(before, /information_schema\.tables[\s\S]*table_name = 'app_data'/, 'expected an existence check guarding the app_data query');
});

test('run-subscription-migration.js resolves its SQL file inside migrations/, not the project root', async () => {
  const source = await readFile(new URL('../migrations/run-subscription-migration.js', import.meta.url), 'utf8');
  // Regression test: __dirname here is path.resolve() (the process cwd, i.e. the project
  // root when run via `npm run migrate`), not the migrations/ directory. Without the
  // 'migrations' path segment this looks for add-subscription-payment-system.sql next to
  // package.json and throws "Migration file not found" on every real run. Verified
  // against a real local PostgreSQL 17 instance on 2026-07-11 (docs/PROGRESS.md).
  assert.match(source, /path\.join\(__dirname,\s*'migrations',\s*'add-subscription-payment-system\.sql'\)/);
});

test('sandbox migration recognizes only the legacy one-time shape', () => {
  const legacy = { goal: { title: 'Goal' }, total: 15, donations: [] };
  const current = { users: [], subscriptions: [], workspaces: [], workspaceSettings: [], paymentProviders: [], donations: [] };
  assert.equal(isLegacySingleUserSandboxData(legacy), true);
  assert.equal(isMultiUserSandboxData(current), true);
  assert.doesNotThrow(() => assertLegacySingleUserSandboxData(legacy));
  assert.throws(() => assertLegacySingleUserSandboxData(current), /already uses the multi-user/);
  assert.throws(() => assertLegacySingleUserSandboxData({}), /not a recognized legacy/);
});
