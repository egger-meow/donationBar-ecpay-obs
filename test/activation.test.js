import test from 'node:test';
import assert from 'node:assert/strict';
import { computeActivationSteps } from '../activation.js';

const configuredProvider = { merchantId: 'm-1', hashKey: 'k'.repeat(32), hashIV: 'i'.repeat(16) };

test('no provider and no settings yields every step incomplete', () => {
  const steps = computeActivationSteps({ provider: null, settings: null });
  assert.deepEqual(steps, {
    ecpayConfigured: false,
    obsConnected: { done: false, at: null },
    firstDonation: { done: false, at: null },
    liveAlertConfirmed: false
  });
});

test('a provider row missing hashIV does not count as configured', () => {
  const steps = computeActivationSteps({
    provider: { merchantId: 'm-1', hashKey: 'k'.repeat(32), hashIV: '' },
    settings: null
  });
  assert.equal(steps.ecpayConfigured, false);
});

test('ecpayConfigured is true once merchantId, hashKey, and hashIV are all present', () => {
  const steps = computeActivationSteps({ provider: configuredProvider, settings: null });
  assert.equal(steps.ecpayConfigured, true);
});

test('obsConnected and firstDonation report their recorded timestamps independently', () => {
  const steps = computeActivationSteps({
    provider: null,
    settings: { obsConnectedAt: '2026-07-11T00:00:00.000Z', firstDonationAt: null }
  });
  assert.deepEqual(steps.obsConnected, { done: true, at: '2026-07-11T00:00:00.000Z' });
  assert.deepEqual(steps.firstDonation, { done: false, at: null });
  assert.equal(steps.liveAlertConfirmed, false, 'liveAlertConfirmed requires both obsConnected and firstDonation');
});

test('liveAlertConfirmed is true only once both obsConnected and firstDonation are true', () => {
  const steps = computeActivationSteps({
    provider: configuredProvider,
    settings: { obsConnectedAt: '2026-07-11T00:00:00.000Z', firstDonationAt: '2026-07-11T00:05:00.000Z' }
  });
  assert.equal(steps.liveAlertConfirmed, true);
});
