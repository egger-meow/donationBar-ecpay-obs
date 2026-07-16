import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public workspace progress uses opaque alert IDs instead of provider trade numbers', async () => {
  const source = await readFile(new URL('../lib/database.js', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('async getWorkspaceProgress'), source.indexOf('async clearWorkspaceDonations'));
  assert.match(method, /alertId:\s*d\.id/);
  assert.doesNotMatch(method, /tradeNo:\s*d\.tradeNo/);
});

test('overlay deduplicates alerts using alertId and never logs donor values', async () => {
  const source = await readFile(new URL('../public/overlay.html', import.meta.url), 'utf8');
  assert.match(source, /latestDonation\.alertId/);
  assert.doesNotMatch(source, /latestDonation\.tradeNo/);
  assert.doesNotMatch(source, /console\.log\('Showing donation alert for:'/);
});
