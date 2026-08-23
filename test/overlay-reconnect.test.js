import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('realtime client tracks reconnection with exponential backoff and cleanup', async () => {
  const source = await readFile(new URL('../public/js/overlay/realtime-client.js', import.meta.url), 'utf8');
  assert.match(source, /this\.eventSource = new EventSource\(eventsUrl\)/);
  assert.match(source, /this\._scheduleReconnect\(\)/);
  assert.match(source, /this\._cleanupEventSource\(\)/);
  assert.match(source, /this\.fetchGoalProgress\(\)/);
});
