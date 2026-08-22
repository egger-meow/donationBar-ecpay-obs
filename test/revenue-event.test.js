import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMonetaryRevenueEvent,
  createSubscriptionRevenueEvent,
  createUnitRevenueEvent,
  normalizeRevenueEvent
} from '../lib/revenue-event.js';

test('canonical monetary revenue event creates valid frozen object', () => {
  const event = createMonetaryRevenueEvent({
    workspaceId: 'ws-123',
    source: 'ecpay',
    sourceEventType: 'donation',
    externalEventId: 'TRADE999',
    amountMinor: 250,
    currency: 'TWD',
    supporter: { displayName: 'Bob', externalUserId: 'user-bob' },
    message: 'Awesome stream!',
    metadata: { paymentType: 'CreditCard' }
  });

  assert.equal(event.workspaceId, 'ws-123');
  assert.equal(event.source, 'ecpay');
  assert.equal(event.sourceEventType, 'donation');
  assert.equal(event.externalEventId, 'TRADE999');
  assert.deepEqual(event.amount, { valueMinor: 250, currency: 'TWD' });
  assert.deepEqual(event.supporter, { displayName: 'Bob', externalUserId: 'user-bob' });
  assert.equal(event.message, 'Awesome stream!');
  assert.equal(event.isSynthetic, false);
  assert.deepEqual(event.metadata, { paymentType: 'CreditCard' });
  assert.ok(Object.isFrozen(event));
  assert.ok(Object.isFrozen(event.amount));
  assert.ok(Object.isFrozen(event.supporter));
  assert.ok(Object.isFrozen(event.metadata));
});

test('canonical unit revenue event creates valid non-monetary event', () => {
  const event = createUnitRevenueEvent({
    workspaceId: 'ws-123',
    source: 'webhook',
    sourceEventType: 'bits',
    externalEventId: 'bits-555',
    quantity: 500,
    supporter: 'Viewer123',
    message: 'cheer500'
  });

  assert.equal(event.source, 'webhook');
  assert.equal(event.sourceEventType, 'bits');
  assert.equal(event.amount, null);
  assert.equal(event.quantity, 500);
  assert.deepEqual(event.supporter, { displayName: 'Viewer123', externalUserId: null });
  assert.equal(event.message, 'cheer500');
});

test('canonical subscription revenue event creates valid subscription event', () => {
  const event = createSubscriptionRevenueEvent({
    workspaceId: 'ws-123',
    source: 'webhook',
    sourceEventType: 'subscription',
    externalEventId: 'sub-777',
    tier: 'tier2',
    quantity: 1,
    amountMinor: 999,
    currency: 'USD',
    supporter: { displayName: 'Subscriber' }
  });

  assert.equal(event.tier, 'tier2');
  assert.equal(event.quantity, 1);
  assert.deepEqual(event.amount, { valueMinor: 999, currency: 'USD' });
  assert.equal(event.supporter.displayName, 'Subscriber');
});

test('canonical revenue events mark manual and test sources as synthetic', () => {
  const testEvent = normalizeRevenueEvent({
    workspaceId: 'ws-123',
    source: 'test',
    sourceEventType: 'test',
    amount: { valueMinor: 100, currency: 'USD' }
  });
  assert.equal(testEvent.isSynthetic, true);

  const manualEvent = normalizeRevenueEvent({
    workspaceId: 'ws-123',
    source: 'manual',
    sourceEventType: 'manual_adjustment',
    amount: { valueMinor: 500, currency: 'EUR' }
  });
  assert.equal(manualEvent.isSynthetic, true);
});

test('canonical revenue events sanitize sensitive credentials from metadata', () => {
  const event = normalizeRevenueEvent({
    workspaceId: 'ws-123',
    source: 'webhook',
    sourceEventType: 'donation',
    amount: { valueMinor: 100, currency: 'USD' },
    metadata: {
      safeField: 'hello',
      hashKey: 'secret-hash-key',
      hashIV: 'secret-iv',
      token: 'secret-token',
      rawBody: 'raw-bytes-buffer',
      nested: {
        safeNested: 123,
        password: 'nested-secret'
      }
    }
  });

  assert.equal(event.metadata.safeField, 'hello');
  assert.equal(event.metadata.hashKey, undefined);
  assert.equal(event.metadata.hashIV, undefined);
  assert.equal(event.metadata.token, undefined);
  assert.equal(event.metadata.rawBody, undefined);
  assert.deepEqual(event.metadata.nested, { safeNested: 123 });
});

test('canonical revenue events reject invalid inputs and currencies', () => {
  // Invalid source
  assert.throws(() => normalizeRevenueEvent({ workspaceId: 'ws-1', source: 'invalid_source' }), /Invalid revenue event source/);

  // Missing workspace
  assert.throws(() => normalizeRevenueEvent({ source: 'ecpay', amount: { valueMinor: 100, currency: 'TWD' } }), /workspaceId/);

  // Invalid currency
  assert.throws(() => normalizeRevenueEvent({ workspaceId: 'ws-1', source: 'webhook', amount: { valueMinor: 100, currency: 'INVALID' } }), /currency/);

  // Negative amount
  assert.throws(() => normalizeRevenueEvent({ workspaceId: 'ws-1', source: 'webhook', amount: { valueMinor: -50, currency: 'USD' } }), /amount/);

  // Float amount
  assert.throws(() => normalizeRevenueEvent({ workspaceId: 'ws-1', source: 'webhook', amount: { valueMinor: '12.50', currency: 'USD' } }), /amount/);

  // Invalid quantity
  assert.throws(() => normalizeRevenueEvent({ workspaceId: 'ws-1', source: 'webhook', sourceEventType: 'bits', quantity: -5 }), /quantity/);

  // Invalid externalEventId with control chars
  assert.throws(() => normalizeRevenueEvent({ workspaceId: 'ws-1', source: 'webhook', sourceEventType: 'donation', amount: { valueMinor: 100, currency: 'USD' }, externalEventId: 'bad\x00id' }), /externalEventId/);
});
