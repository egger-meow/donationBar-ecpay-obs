import test from 'node:test';
import assert from 'node:assert/strict';
import { computeActivationFunnel, computeActivationSteps } from '../lib/activation.js';

const configuredProvider = { merchantId: 'm-1', hashKey: 'k'.repeat(32), hashIV: 'i'.repeat(16) };

test('no provider and no settings yields every step incomplete', () => {
  const steps = computeActivationSteps({ provider: null, settings: null });
  assert.deepEqual(steps, {
    ecpayConfigured: { done: false, at: null },
    obsConnected: { done: false, at: null },
    firstDonation: { done: false, at: null },
    liveAlertDelivered: { done: false, at: null }
  });
});

test('a provider row missing hashIV does not count as configured', () => {
  const steps = computeActivationSteps({
    provider: { merchantId: 'm-1', hashKey: 'k'.repeat(32), hashIV: '' },
    settings: null
  });
  assert.equal(steps.ecpayConfigured.done, false);
});

test('ecpayConfigured records its first complete-configuration timestamp', () => {
  const steps = computeActivationSteps({ provider: configuredProvider, settings: { providerConfiguredAt: '2026-07-11T00:01:00.000Z' } });
  assert.deepEqual(steps.ecpayConfigured, { done: true, at: '2026-07-11T00:01:00.000Z' });
});

test('obsConnected and firstDonation report their recorded timestamps independently', () => {
  const steps = computeActivationSteps({
    provider: null,
    settings: { obsConnectedAt: '2026-07-11T00:00:00.000Z', firstDonationAt: null }
  });
  assert.deepEqual(steps.obsConnected, { done: true, at: '2026-07-11T00:00:00.000Z' });
  assert.deepEqual(steps.firstDonation, { done: false, at: null });
  assert.equal(steps.liveAlertDelivered.done, false, 'live alert requires an overlay connection before the donation');
});

test('live alert is counted only when the overlay was connected before the donation', () => {
  const steps = computeActivationSteps({
    provider: configuredProvider,
    settings: { obsConnectedAt: '2026-07-11T00:00:00.000Z', firstDonationAt: '2026-07-11T00:05:00.000Z' }
  });
  assert.deepEqual(steps.liveAlertDelivered, { done: true, at: '2026-07-11T00:05:00.000Z' });
});

test('a later overlay connection cannot retroactively count as a delivered alert', () => {
  const steps = computeActivationSteps({
    provider: configuredProvider,
    settings: { firstDonationAt: '2026-07-11T00:00:00.000Z', obsConnectedAt: '2026-07-11T00:05:00.000Z' }
  });
  assert.deepEqual(steps.liveAlertDelivered, { done: false, at: null });
});

test('activation funnel returns aggregate counts and median elapsed time without tenant records', () => {
  const funnel = computeActivationFunnel([
    { oauthCompletedAt: '2026-07-11T00:00:00.000Z', workspaceCreatedAt: '2026-07-11T00:01:00.000Z', providerConfiguredAt: '2026-07-11T00:02:00.000Z', obsConnectedAt: '2026-07-11T00:03:00.000Z', firstDonationAt: '2026-07-11T00:04:00.000Z', liveAlertDeliveredAt: '2026-07-11T00:04:00.000Z' },
    { oauthCompletedAt: '2026-07-11T00:00:00.000Z', workspaceCreatedAt: '2026-07-11T00:03:00.000Z', providerConfiguredAt: '2026-07-11T00:06:00.000Z', obsConnectedAt: null, firstDonationAt: null, liveAlertDeliveredAt: null }
  ]);

  assert.deepEqual(funnel, {
    workspaces: 2,
    milestones: {
      workspaceCreatedAt: { completed: 2, medianMillisecondsFromOAuth: 120000 },
      providerConfiguredAt: { completed: 2, medianMillisecondsFromOAuth: 240000 },
      obsConnectedAt: { completed: 1, medianMillisecondsFromOAuth: 180000 },
      firstDonationAt: { completed: 1, medianMillisecondsFromOAuth: 240000 },
      liveAlertDeliveredAt: { completed: 1, medianMillisecondsFromOAuth: 240000 }
    }
  });
});
