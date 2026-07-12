import test from 'node:test';
import assert from 'node:assert/strict';
import { createDonationTradeNo, createProviderTradeNo, createSubscriptionTradeNo } from '../trade-number.js';

test('provider trade numbers stay alphanumeric, bounded, and entropy-backed', () => {
  const requestedSizes = [];
  const fixedRandom = size => {
    requestedSizes.push(size);
    return Buffer.alloc(size, 0xab);
  };
  const donation = createDonationTradeNo(1_750_000_000_000, fixedRandom);
  const subscription = createSubscriptionTradeNo(1_750_000_000_000, fixedRandom);

  assert.match(donation, /^D[A-Z0-9]+$/);
  assert.match(subscription, /^SUB[A-Z0-9]+$/);
  assert.ok(donation.length <= 20);
  assert.ok(subscription.length <= 20);
  assert.deepEqual(requestedSizes, [5, 4]);
});

test('provider trade number validation rejects unsafe prefixes and timestamps', () => {
  assert.throws(() => createProviderTradeNo('sub', Date.now()), /prefix/);
  assert.throws(() => createProviderTradeNo('SUB-', Date.now()), /prefix/);
  assert.throws(() => createProviderTradeNo('SUB', -1), /timestamp/);
  assert.throws(() => createProviderTradeNo('SUB', Number.MAX_SAFE_INTEGER), /entropy/);
});
