import { normalizeRevenueEvent } from '../revenue-event.js';

/**
 * Creates a normalized Revenue Event for synthetic test events.
 *
 * Requirements:
 * - Scoped to the authenticated creator workspace
 * - isSynthetic is always true
 * - Isolated from real provider credentials and billing
 *
 * @param {Object} input - { workspaceId, amountMinor, currency, quantity, type, supporter, message, externalId, metadata }
 * @returns {Readonly<Object>} Canonical Revenue Event
 */
export function createTestRevenueEvent({
  workspaceId,
  amountMinor = 100,
  currency = 'TWD',
  quantity = null,
  type = 'test',
  supporter = 'Tester',
  message = 'Test contribution',
  externalId = null,
  metadata = {}
} = {}) {
  if (!workspaceId) {
    throw new Error('Test revenue event requires a workspaceId');
  }

  let amount = null;
  if (amountMinor !== null && amountMinor !== undefined) {
    amount = {
      valueMinor: amountMinor,
      currency: currency || 'TWD'
    };
  }

  return normalizeRevenueEvent({
    workspaceId,
    source: 'test',
    sourceEventType: type || 'test',
    externalEventId: externalId ? String(externalId).trim() : null,
    amount,
    quantity,
    supporter: typeof supporter === 'string' ? { displayName: supporter } : supporter,
    message: message || null,
    isSynthetic: true,
    metadata: {
      ...metadata,
      testMode: true
    }
  });
}
