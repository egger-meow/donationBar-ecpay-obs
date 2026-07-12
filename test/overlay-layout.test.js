import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('overlay alert layout stays inside short OBS viewports and bounds long messages', async () => {
  const source = await readFile(new URL('../public/overlay.html', import.meta.url), 'utf8');
  assert.match(source, /top:\s*clamp\(20px,\s*22vh,\s*170px\)/);
  assert.match(source, /max-height:\s*calc\(100vh - 20px\)/);
  assert.match(source, /\.alert-user-message[\s\S]*?max-height:\s*30vh/);
  assert.match(source, /\.alert-user-message[\s\S]*?overflow-y:\s*auto/);
});
