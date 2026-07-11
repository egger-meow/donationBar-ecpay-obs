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

test('sandbox migration recognizes only the legacy one-time shape', () => {
  const legacy = { goal: { title: 'Goal' }, total: 15, donations: [] };
  const current = { users: [], subscriptions: [], workspaces: [], workspaceSettings: [], paymentProviders: [], donations: [] };
  assert.equal(isLegacySingleUserSandboxData(legacy), true);
  assert.equal(isMultiUserSandboxData(current), true);
  assert.doesNotThrow(() => assertLegacySingleUserSandboxData(legacy));
  assert.throws(() => assertLegacySingleUserSandboxData(current), /already uses the multi-user/);
  assert.throws(() => assertLegacySingleUserSandboxData({}), /not a recognized legacy/);
});
