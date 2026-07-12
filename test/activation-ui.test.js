import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('activation UI exposes copy/test controls and overlay test mode emits an alert event', async () => {
  const admin = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  const overlay = await readFile(new URL('../public/overlay.html', import.meta.url), 'utf8');
  assert.match(admin, /onclick="copyObsUrl\(\)"/);
  assert.match(admin, /onclick="openObsTest\(\)"/);
  assert.match(admin, /15 分鐘|15分鐘/);
  assert.match(overlay, /const testMode = new URLSearchParams/);
  assert.match(overlay, /latestDonation:\s*\{\s*alertId/);
  assert.match(overlay, /testMode\)\s*\{[\s\S]*?eventSource = setupSSE\(\);/);
});
