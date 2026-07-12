import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('activation UI exposes copy/test controls and overlay test mode emits an alert event', async () => {
  const admin = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  const overlay = await readFile(new URL('../public/overlay.html', import.meta.url), 'utf8');
  assert.match(admin, /onclick="copyObsUrl\(\)"/);
  assert.match(admin, /onclick="openObsTest\(\)"/);
  assert.match(admin, /onclick="sendObsTestAlert\(\)"/);
  assert.match(admin, /15 分鐘|15分鐘/);
  assert.match(admin, /\/admin\/activation\/test-alert/);
  assert.match(overlay, /const testMode = new URLSearchParams/);
  assert.match(overlay, /latestDonation:\s*\{\s*alertId/);
  assert.match(overlay, /testMode\)\s*\{[\s\S]*?eventSource = setupSSE\(\);/);
});

test('server test-alert path is sandbox-only, transient, and provider-independent', async () => {
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const routeStart = server.indexOf("app.post('/admin/activation/test-alert'");
  assert.notEqual(routeStart, -1);
  const route = server.slice(routeStart, routeStart + 1800);
  assert.match(route, /if \(production\) return res\.status\(404\)/);
  assert.match(route, /createTestDonationEvent/);
  assert.match(route, /broadcastProgress\(workspace\.id, donationEvent\)/);
  assert.doesNotMatch(route, /addDonation\(/);
});
