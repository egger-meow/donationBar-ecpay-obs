import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('migration script never prints configured administrator credentials', async () => {
  const source = await readFile(new URL('../migrations/migrate.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.log\([^\r\n]*adminEmail/);
  assert.doesNotMatch(source, /console\.log\([^\r\n]*adminUsername/);
  assert.doesNotMatch(source, /console\.log\([^\r\n]*adminPassword/);
});
