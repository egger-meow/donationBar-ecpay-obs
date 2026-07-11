import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL_RATE_LIMIT, PROVIDER_CALLBACK_RATE_LIMIT, isProviderCallbackPath } from '../rate-limit-policy.js';

test('provider callback paths are isolated from the general rate-limit bucket', () => {
  assert.equal(isProviderCallbackPath('/webhook'), true);
  assert.equal(isProviderCallbackPath('/webhook/creator'), true);
  assert.equal(isProviderCallbackPath('/ecpay/period/callback'), true);
  assert.equal(isProviderCallbackPath('/create-order'), false);
  assert.equal(isProviderCallbackPath('/events'), false);
});

test('provider callback budget is higher than public budget without being unlimited', () => {
  assert.equal(GENERAL_RATE_LIMIT, 300);
  assert.equal(PROVIDER_CALLBACK_RATE_LIMIT, 600);
  assert.ok(PROVIDER_CALLBACK_RATE_LIMIT > GENERAL_RATE_LIMIT && PROVIDER_CALLBACK_RATE_LIMIT < 10_000);
});
