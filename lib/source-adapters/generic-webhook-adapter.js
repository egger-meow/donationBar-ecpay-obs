import { normalizeRevenueEvent } from '../revenue-event.js';

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit

/**
 * Normalizes an incoming Generic Webhook payload into a canonical Revenue Event.
 *
 * @param {Object} payload - The parsed JSON body
 * @param {Object} context - { workspaceId: string }
 * @returns {Readonly<Object>} Canonical Revenue Event
 */
export function normalizeGenericWebhookPayload(payload = {}, { workspaceId } = {}) {
  if (!workspaceId) {
    throw new Error('Generic webhook requires a resolved workspaceId');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Generic webhook payload must be a JSON object');
  }

  const rawEventId = payload.eventId || payload.id;
  if (!rawEventId || typeof rawEventId !== 'string' || !rawEventId.trim()) {
    throw new Error('Generic webhook payload requires a non-empty string eventId');
  }
  const eventId = rawEventId.trim();
  if (eventId.length > 100 || /[\x00-\x1F\x7F]/.test(eventId)) {
    throw new Error('Generic webhook eventId contains invalid characters or exceeds 100 characters');
  }

  const sourceEventType = String(payload.type || payload.sourceEventType || (payload.amount !== undefined ? 'donation' : (payload.quantity !== undefined ? 'unit' : 'support'))).trim().toLowerCase();

  // Handle amount & currency
  let amount = null;
  if (payload.amount !== undefined && payload.amount !== null) {
    let rawAmount = null;
    let rawCurrency = payload.currency;

    if (typeof payload.amount === 'object' && payload.amount !== null) {
      rawAmount = payload.amount.valueMinor ?? payload.amount.amount;
      rawCurrency = payload.amount.currency || rawCurrency;
    } else {
      rawAmount = payload.amount;
    }

    if (rawAmount !== undefined && rawAmount !== null) {
      amount = {
        valueMinor: rawAmount,
        currency: rawCurrency || 'USD'
      };
    }
  }

  // Handle supporter
  let supporter = null;
  if (payload.supporter !== undefined && payload.supporter !== null) {
    if (typeof payload.supporter === 'string') {
      supporter = { displayName: payload.supporter };
    } else if (typeof payload.supporter === 'object') {
      supporter = {
        displayName: payload.supporter.displayName || payload.supporter.name || null,
        externalUserId: payload.supporter.externalUserId || payload.supporter.id || null
      };
    }
  } else if (payload.payer) {
    supporter = { displayName: String(payload.payer) };
  }

  return normalizeRevenueEvent({
    workspaceId,
    source: 'webhook',
    sourceEventType,
    externalEventId: eventId,
    amount,
    quantity: payload.quantity,
    tier: payload.tier,
    supporter,
    message: payload.message || payload.note || null,
    occurredAt: payload.occurredAt || payload.timestamp || null,
    isSynthetic: false,
    metadata: payload.metadata || {}
  });
}
