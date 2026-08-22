import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualRevenueEvent } from '../lib/source-adapters/manual-adapter.js';
import { createTestRevenueEvent } from '../lib/source-adapters/test-adapter.js';

test('manual adapter creates workspace-scoped synthetic revenue event with distinct IDs', () => {
  const event1 = createManualRevenueEvent({
    workspaceId: 'ws-manual-1',
    amountMinor: 300,
    currency: 'USD',
    supporter: 'Manual Donor',
    message: 'Added manually via admin'
  });

  const event2 = createManualRevenueEvent({
    workspaceId: 'ws-manual-1',
    amountMinor: 300,
    currency: 'USD',
    supporter: 'Manual Donor',
    message: 'Added manually via admin'
  });

  assert.equal(event1.workspaceId, 'ws-manual-1');
  assert.equal(event1.source, 'manual');
  assert.equal(event1.sourceEventType, 'manual_adjustment');
  assert.equal(event1.externalEventId, null);
  assert.equal(event1.isSynthetic, true);
  assert.deepEqual(event1.amount, { valueMinor: 300, currency: 'USD' });

  // Each manual event must have a distinct generated UUID and null externalEventId so they don't deduplicate
  assert.notEqual(event1.id, event2.id);
  assert.equal(event1.externalEventId, null);
  assert.equal(event2.externalEventId, null);
});

test('test adapter creates synthetic test revenue event isolated from provider billing', () => {
  const event = createTestRevenueEvent({
    workspaceId: 'ws-test-1',
    amountMinor: 500,
    currency: 'TWD',
    supporter: 'Test User',
    message: 'Testing milestone animation',
    externalId: 'test-run-123'
  });

  assert.equal(event.workspaceId, 'ws-test-1');
  assert.equal(event.source, 'test');
  assert.equal(event.isSynthetic, true);
  assert.equal(event.externalEventId, 'test-run-123');
  assert.deepEqual(event.amount, { valueMinor: 500, currency: 'TWD' });
  assert.equal(event.metadata.testMode, true);
});

test('manual and test adapters reject missing workspaceId', () => {
  assert.throws(() => createManualRevenueEvent({ amountMinor: 100 }), /workspaceId/);
  assert.throws(() => createTestRevenueEvent({ amountMinor: 100 }), /workspaceId/);
});
