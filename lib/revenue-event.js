import { v4 as uuidv4 } from 'uuid';
import { normalizeRevenueCurrency, parseMinorUnitAmount } from './money.js';
import { getSourceDefinition, isSourceActive } from './source-registry.js';

const SENSITIVE_METADATA_KEYS = new Set([
  'hashkey',
  'hashiv',
  'secret',
  'token',
  'webhooktoken',
  'webhooksecret',
  'password',
  'authorization',
  'creditcard',
  'cardnumber',
  'cardauthcode',
  'rawbody',
  'rawformbody',
  'sessionsecret',
  'credentials'
]);

/**
 * Sanitizes metadata to prevent accidental secret or credential leakage.
 * @param {Object} metadata
 * @returns {Object} Deep-cloned, sanitized plain object
 */
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const clean = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_METADATA_KEYS.has(lowerKey)) {
      continue;
    }
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) {
        clean[key] = value.map(item => (typeof item === 'object' && item !== null ? sanitizeMetadata(item) : item));
      } else {
        clean[key] = sanitizeMetadata(value);
      }
    } else if (typeof value === 'function' || typeof value === 'symbol') {
      continue;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Validates and normalizes an ISO 8601 date string.
 * @param {string|Date} dateInput
 * @param {string} fallbackIso
 * @returns {string}
 */
function normalizeIsoDate(dateInput, fallbackIso) {
  if (!dateInput) return fallbackIso;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid timestamp for revenue event');
  }
  return d.toISOString();
}

/**
 * Canonical provider-independent Revenue Event representation.
 * Records "What happened at the revenue source".
 *
 * @param {Object} input
 * @returns {Readonly<Object>} Frozen canonical Revenue Event
 */
export function normalizeRevenueEvent(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('Revenue event input must be an object');
  }

  const id = input.id ? String(input.id).trim() : uuidv4();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error('Invalid revenue event ID');
  }

  const workspaceId = String(input.workspaceId || '').trim();
  if (!workspaceId || workspaceId.length > 64) {
    throw new Error('Invalid or missing revenue event workspaceId');
  }

  const source = String(input.source || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,30}$/.test(source) || !getSourceDefinition(source)) {
    throw new Error(`Invalid revenue event source: ${source}`);
  }

  const rawEventType = input.sourceEventType || input.type || (input.amount ? 'donation' : (input.quantity !== undefined && input.quantity !== null ? 'unit' : 'support'));
  const sourceEventType = String(rawEventType).trim().toLowerCase();
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(sourceEventType)) {
    throw new Error(`Invalid revenue event sourceEventType: ${sourceEventType}`);
  }

  let externalEventId = null;
  if (input.externalEventId !== undefined && input.externalEventId !== null && String(input.externalEventId).trim() !== '') {
    const rawExternalId = String(input.externalEventId).trim();
    if (rawExternalId.length > 100 || /[\x00-\x1F\x7F]/.test(rawExternalId)) {
      throw new Error('Invalid revenue event externalEventId');
    }
    externalEventId = rawExternalId;
  }

  const nowIso = new Date().toISOString();
  const occurredAt = normalizeIsoDate(input.occurredAt, nowIso);
  const receivedAt = normalizeIsoDate(input.receivedAt, nowIso);

  // Amount handling (optional, but if present must be integer minor units and valid ISO currency)
  let amount = null;
  if (input.amount !== undefined && input.amount !== null) {
    let rawAmount = null;
    let rawCurrency = null;

    if (typeof input.amount === 'object') {
      rawAmount = input.amount.valueMinor ?? input.amount.amount;
      rawCurrency = input.amount.currency;
    } else {
      rawAmount = input.amount;
      rawCurrency = input.currency;
    }

    const parsedMinor = parseMinorUnitAmount(rawAmount, { minimum: 0 });
    const normalizedCurrency = normalizeRevenueCurrency(rawCurrency);

    if (!Number.isSafeInteger(parsedMinor)) {
      throw new Error('Invalid revenue event amount: must be a non-negative integer minor unit');
    }
    if (!normalizedCurrency) {
      throw new Error(`Invalid revenue event currency: ${rawCurrency}`);
    }

    amount = Object.freeze({
      valueMinor: parsedMinor,
      currency: normalizedCurrency
    });
  }

  // Quantity handling (e.g. 500 bits, 5 gift subs)
  let quantity = null;
  if (input.quantity !== undefined && input.quantity !== null) {
    const parsedQuantity = Number(input.quantity);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1) {
      throw new Error('Invalid revenue event quantity: must be a positive integer >= 1');
    }
    quantity = parsedQuantity;
  }

  // Tier handling (e.g. 'tier1', 'tier2', 'tier3', 'prime')
  let tier = null;
  if (input.tier !== undefined && input.tier !== null && String(input.tier).trim() !== '') {
    const rawTier = String(input.tier).trim().toLowerCase();
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(rawTier)) {
      throw new Error('Invalid revenue event tier format');
    }
    tier = rawTier;
  }

  // Must have at least an amount, quantity, or valid event type
  if (!amount && quantity === null && !['test', 'manual_adjustment', 'ping'].includes(sourceEventType)) {
    throw new Error('Revenue event must contain either an amount or a quantity');
  }

  // Supporter info
  let supporter = null;
  if (input.supporter !== undefined && input.supporter !== null) {
    let displayName = null;
    let externalUserId = null;

    if (typeof input.supporter === 'string') {
      displayName = input.supporter.trim().slice(0, 100) || null;
    } else if (typeof input.supporter === 'object') {
      if (input.supporter.displayName) {
        displayName = String(input.supporter.displayName).trim().slice(0, 100) || null;
      }
      if (input.supporter.externalUserId) {
        externalUserId = String(input.supporter.externalUserId).trim().slice(0, 100) || null;
      }
    }

    if (displayName || externalUserId) {
      supporter = Object.freeze({
        displayName: displayName || null,
        externalUserId: externalUserId || null
      });
    }
  }

  // Message / Note
  const message = input.message !== undefined && input.message !== null
    ? String(input.message).trim().slice(0, 500)
    : null;

  // Synthetic / Test flag
  const isSynthetic = Boolean(
    input.isSynthetic === true ||
    source === 'test' ||
    source === 'manual' ||
    sourceEventType === 'test'
  );

  // Metadata
  const metadata = Object.freeze(sanitizeMetadata(input.metadata));

  return Object.freeze({
    id,
    workspaceId,
    source,
    sourceEventType,
    externalEventId,
    occurredAt,
    receivedAt,
    amount,
    quantity,
    tier,
    supporter,
    message: message || null,
    isSynthetic,
    metadata
  });
}

/**
 * Creates a normalized monetary revenue event (e.g. donation, tip, super chat).
 */
export function createMonetaryRevenueEvent({
  workspaceId,
  source,
  sourceEventType = 'donation',
  externalEventId = null,
  amountMinor,
  currency = 'USD',
  supporter = null,
  message = null,
  isSynthetic = false,
  metadata = {}
}) {
  return normalizeRevenueEvent({
    workspaceId,
    source,
    sourceEventType,
    externalEventId,
    amount: { valueMinor: amountMinor, currency },
    supporter,
    message,
    isSynthetic,
    metadata
  });
}

/**
 * Creates a normalized non-monetary unit revenue event (e.g. bits, channel points).
 */
export function createUnitRevenueEvent({
  workspaceId,
  source,
  sourceEventType = 'bits',
  externalEventId = null,
  quantity,
  supporter = null,
  message = null,
  isSynthetic = false,
  metadata = {}
}) {
  return normalizeRevenueEvent({
    workspaceId,
    source,
    sourceEventType,
    externalEventId,
    quantity,
    supporter,
    message,
    isSynthetic,
    metadata
  });
}

/**
 * Creates a normalized subscription revenue event (e.g. sub, resub, gifted sub).
 */
export function createSubscriptionRevenueEvent({
  workspaceId,
  source,
  sourceEventType = 'subscription',
  externalEventId = null,
  tier = 'tier1',
  quantity = 1,
  amountMinor = null,
  currency = null,
  supporter = null,
  message = null,
  isSynthetic = false,
  metadata = {}
}) {
  return normalizeRevenueEvent({
    workspaceId,
    source,
    sourceEventType,
    externalEventId,
    tier,
    quantity,
    amount: amountMinor !== null && currency ? { valueMinor: amountMinor, currency } : null,
    supporter,
    message,
    isSynthetic,
    metadata
  });
}
