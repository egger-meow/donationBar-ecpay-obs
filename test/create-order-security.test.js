import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public donation order creation requires same-origin evidence before its handler', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /app\.post\('\/create-order',\s*requireSameOrigin,\s*async \(req, res\)/);
});
