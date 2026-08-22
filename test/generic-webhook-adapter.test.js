import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGenericWebhookPayload } from '../lib/source-adapters/generic-webhook-adapter.js';

test('generic webhook adapter normalizes valid monetary payload', () => {
  const payload = {
    eventId: 'ext-payment-100',
    type: 'donation',
    amount: 1500,
    currency: 'USD',
    supporter: {
      displayName: 'Alice',
      externalUserId: 'alice-id'
    },
    message: 'Good luck with the stream!',
    occurredAt: '2026-08-22T10:00:00.000Z',
    metadata: {
      sourceApp: 'CustomDonationBot'
    }
  };

  const event = normalizeGenericWebhookPayload(payload, { workspaceId: 'ws-123' });

  assert.equal(event.workspaceId, 'ws-123');
  assert.equal(event.source, 'webhook');
  assert.equal(event.sourceEventType, 'donation');
  assert.equal(event.externalEventId, 'ext-payment-100');
  assert.deepEqual(event.amount, { valueMinor: 1500, currency: 'USD' });
  assert.deepEqual(event.supporter, { displayName: 'Alice', externalUserId: 'alice-id' });
  assert.equal(event.message, 'Good luck with the stream!');
  assert.equal(event.occurredAt, '2026-08-22T10:00:00.000Z');
  assert.equal(event.isSynthetic, false);
  assert.deepEqual(event.metadata, { sourceApp: 'CustomDonationBot' });
});

test('generic webhook adapter normalizes simple supporter string and nested amount', () => {
  const payload = {
    eventId: 'ext-200',
    amount: { valueMinor: 500, currency: 'EUR' },
    supporter: 'Bob',
    message: 'Cheers!'
  };

  const event = normalizeGenericWebhookPayload(payload, { workspaceId: 'ws-456' });
  assert.equal(event.externalEventId, 'ext-200');
  assert.deepEqual(event.amount, { valueMinor: 500, currency: 'EUR' });
  assert.deepEqual(event.supporter, { displayName: 'Bob', externalUserId: null });
});

test('generic webhook adapter normalizes non-monetary unit payload', () => {
  const payload = {
    eventId: 'ext-bits-300',
    type: 'bits',
    quantity: 250,
    supporter: { displayName: 'Charlie' }
  };

  const event = normalizeGenericWebhookPayload(payload, { workspaceId: 'ws-789' });
  assert.equal(event.source, 'webhook');
  assert.equal(event.sourceEventType, 'bits');
  assert.equal(event.externalEventId, 'ext-bits-300');
  assert.equal(event.amount, null);
  assert.equal(event.quantity, 250);
});

test('generic webhook adapter rejects missing workspaceId or invalid payload', () => {
  assert.throws(() => normalizeGenericWebhookPayload({ eventId: '1' }, {}), /workspaceId/);
  assert.throws(() => normalizeGenericWebhookPayload(null, { workspaceId: 'ws-1' }), /JSON object/);
  assert.throws(() => normalizeGenericWebhookPayload({}, { workspaceId: 'ws-1' }), /eventId/);
  assert.throws(() => normalizeGenericWebhookPayload({ eventId: '' }, { workspaceId: 'ws-1' }), /eventId/);
  assert.throws(() => normalizeGenericWebhookPayload({ eventId: 'bad\x00id' }, { workspaceId: 'ws-1' }), /invalid characters/);
});
