import { normalizeRevenueEvent } from '../revenue-event.js';

/**
 * Creates a normalized Revenue Event for a manual creator contribution / goal adjustment.
 *
 * Requirements:
 * - Scoped to the authenticated creator workspace
 * - isSynthetic is always true
 * - externalEventId is null so repeated intentional manual submissions remain distinct events
 *
 * @param {Object} input - { workspaceId, amountMinor, currency, quantity, type, supporter, message, metadata }
 * @returns {Readonly<Object>} Canonical Revenue Event
 */
export function createManualRevenueEvent({
  workspaceId,
  amountMinor = null,
  currency = 'USD',
  quantity = null,
  type = 'manual_adjustment',
  supporter = null,
  message = null,
  metadata = {}
} = {}) {
  if (!workspaceId) {
    throw new Error('Manual revenue event requires a workspaceId');
  }

  let amount = null;
  if (amountMinor !== null && amountMinor !== undefined) {
    amount = {
      valueMinor: amountMinor,
      currency: currency || 'USD'
    };
  }

  return normalizeRevenueEvent({
    workspaceId,
    source: 'manual',
    sourceEventType: type || 'manual_adjustment',
    externalEventId: null,
    amount,
    quantity,
    supporter: typeof supporter === 'string' ? { displayName: supporter } : supporter,
    message: message || null,
    isSynthetic: true,
    metadata: {
      ...metadata,
      entryType: 'creator_manual'
    }
  });
}
