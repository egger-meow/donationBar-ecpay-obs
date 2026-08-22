import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL_RATE_LIMIT, PROVIDER_CALLBACK_RATE_LIMIT, isProviderCallbackPath, EdgeMemoryStore } from '../lib/rate-limit-policy.js';

test('provider callback paths are isolated from the general rate-limit bucket', () => {
  assert.equal(isProviderCallbackPath('/webhook'), true);
  assert.equal(isProviderCallbackPath('/webhook/creator'), true);
  assert.equal(isProviderCallbackPath('/api/webhook/generic/creator'), true);
  assert.equal(isProviderCallbackPath('/ecpay/period/callback'), true);
  assert.equal(isProviderCallbackPath('/create-order'), false);
  assert.equal(isProviderCallbackPath('/events'), false);
});

test('provider callback budget is higher than public budget without being unlimited', () => {
  assert.equal(GENERAL_RATE_LIMIT, 300);
  assert.equal(PROVIDER_CALLBACK_RATE_LIMIT, 600);
  assert.ok(PROVIDER_CALLBACK_RATE_LIMIT > GENERAL_RATE_LIMIT && PROVIDER_CALLBACK_RATE_LIMIT < 10_000);
});

test('EdgeMemoryStore tracks hits and resets without global timers', async () => {
  const store = new EdgeMemoryStore();
  store.init({ windowMs: 100 });

  const first = await store.increment('ip-1');
  assert.equal(first.totalHits, 1);

  const second = await store.increment('ip-1');
  assert.equal(second.totalHits, 2);

  const current = await store.get('ip-1');
  assert.equal(current.totalHits, 2);

  await store.decrement('ip-1');
  const decremented = await store.get('ip-1');
  assert.equal(decremented.totalHits, 1);

  await store.resetKey('ip-1');
  assert.equal(await store.get('ip-1'), undefined);
});
