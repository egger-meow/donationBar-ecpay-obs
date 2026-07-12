import { normalizeCurrency, parseMinorUnitAmount } from './money.js';

const MAX_EXTERNAL_ID_LENGTH = 50;
const MAX_PAYER_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 300;

// Canonical provider-independent donation event consumed by persistence, goals, and
// OBS. Provider adapters translate their verified payloads into this shape first.
export function normalizeDonationEvent({
  provider,
  externalId,
  amount,
  currency = 'TWD',
  payer = '匿名',
  message = '',
  providerRecordId = null
} = {}) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedExternalId = String(externalId || '').trim();
  const normalizedAmount = parseMinorUnitAmount(amount);
  const normalizedCurrency = normalizeCurrency(currency);
  if (!/^[a-z0-9_-]{1,30}$/.test(normalizedProvider)) throw new Error('Invalid donation event provider');
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(normalizedExternalId) || normalizedExternalId.length > MAX_EXTERNAL_ID_LENGTH) {
    throw new Error('Invalid donation event external ID');
  }
  if (!Number.isSafeInteger(normalizedAmount)) throw new Error('Invalid donation event amount');
  return Object.freeze({
    provider: normalizedProvider,
    externalId: normalizedExternalId,
    amount: normalizedAmount,
    currency: normalizedCurrency,
    payer: String(payer || '').trim().slice(0, MAX_PAYER_LENGTH) || '匿名',
    message: String(message || '').trim().slice(0, MAX_MESSAGE_LENGTH),
    providerRecordId: providerRecordId ? String(providerRecordId).trim().slice(0, MAX_EXTERNAL_ID_LENGTH) : null
  });
}

// Safe local adapter for activation and UI tests. It never contacts a provider or
// accepts provider credentials; callers supply the event fields explicitly.
export function createTestDonationEvent(input) {
  return normalizeDonationEvent({ ...input, provider: 'test' });
}
