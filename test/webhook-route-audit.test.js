import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('only one workspace webhook route is registered', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const registrations = source.match(/app\.post\('\/webhook\/:slug'/g) || [];
  assert.equal(registrations.length, 1);
});

test('legacy callback implementations are removed from the server source', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const occurrences = source.match(/legacyDuplicateWebhookHandler/g) || [];
  assert.equal(occurrences.length, 0, 'dead legacy webhook code must not remain');
  assert.doesNotMatch(source, /legacyDefaultWebhookHandler|legacyEncryptedSubscriptionCallback/);
});

test('payment callback route inventory keeps state-changing fallbacks idempotent', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /app\.post\('\/success',\s*async \(req, res\)/);
  assert.match(source, /app\.post\('\/ecpay\/return',\s*async \(req, res\)/);
  assert.match(source, /app\.post\('\/ecpay\/period\/callback',\s*async \(req, res\)/);
  assert.match(source, /async function addDonation[\s\S]*database\.addDonation/);
});
