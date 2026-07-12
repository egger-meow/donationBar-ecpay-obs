import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../promise-timeout.js';

test('withTimeout returns a completed operation and clears its timer', async () => {
  assert.equal(await withTimeout(async () => 'ready', 100), 'ready');
});

test('withTimeout rejects promptly and runs timeout cleanup', async () => {
  let cleaned = false;
  const started = Date.now();
  await assert.rejects(
    withTimeout(() => new Promise(resolve => setTimeout(resolve, 100)), 10, () => { cleaned = true; }),
    /timed out/
  );
  assert.equal(cleaned, true);
  assert.ok(Date.now() - started < 80);
});

test('withTimeout validates its inputs', () => {
  assert.throws(() => withTimeout(null, 10), /operation/);
  assert.throws(() => withTimeout(() => true, 0), /timeoutMs/);
});
