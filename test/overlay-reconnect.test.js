import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('overlay tracks a replacement SSE connection for cleanup after reconnect', async () => {
  const source = await readFile(new URL('../public/overlay.html', import.meta.url), 'utf8');
  assert.match(source, /const connection = new EventSource\(eventsUrl\)/);
  assert.match(source, /eventSource = setupSSE\(\);/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*setupSSE\(\);/);
  assert.match(source, /return connection;/);
});
