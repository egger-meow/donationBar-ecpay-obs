import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server registers /api/overlay/test-event for creator test console', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.post('/api/overlay/test-event'");
  assert.notEqual(routeStart, -1);
  const route = source.slice(routeStart, routeStart + 2200);

  assert.match(route, /broadcastMilestoneEvents/);
  assert.match(route, /isSynthetic:\s*true/);
  assert.doesNotMatch(route, /database\.addDonation/);
  assert.doesNotMatch(route, /database\.addRevenueEvent/);
});

test('server /admin/overlay accepts and validates theme parameter', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /const validThemes = \['minimal', 'gaming', 'creator'\]/);
  assert.match(source, /overlaySettings\.theme = settings\.theme/);
});

test('admin UI includes OBS setup steps and test event buttons', async () => {
  const source = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  assert.match(source, /OBS 設定 4 步驟/);
  assert.match(source, /sendObsTestEvent\('progress'\)/);
  assert.match(source, /sendObsTestEvent\('milestone',\s*50\)/);
  assert.match(source, /sendObsTestEvent\('completion'\)/);
  assert.match(source, /sendObsTestEvent\('sound'\)/);
  assert.match(source, /<select id="themeInput">/);
});
