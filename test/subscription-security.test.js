import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('feedback cannot contain a subscription-upgrade backdoor trigger', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /jjmow is my daddy fuck fuck fuck/);
  assert.doesNotMatch(source, /subscription\.free_pass_granted/);
});
