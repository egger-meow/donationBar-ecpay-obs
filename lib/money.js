// Monetary values are persisted as integer minor units with an explicit ISO 4217 code.
// ECPay currently settles DonationBar donations in TWD.
// The Universal Revenue Event Core supports global ISO 4217 currencies for multi-source revenue aggregation.

export const SUPPORTED_DONATION_CURRENCIES = new Set(['TWD']);

export const CURRENCY_MINOR_UNIT_DECIMALS = Object.freeze({
  TWD: 0,
  JPY: 0,
  KRW: 0,
  CLP: 0,
  VND: 0,
  HUF: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  SGD: 2,
  HKD: 2,
  NZD: 2,
  CHF: 2,
  BRL: 2,
  MYR: 2,
  PHP: 2,
  THB: 2,
  INR: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  MXN: 2,
  CZK: 2,
  ILS: 2,
  ZAR: 2
});

export const SUPPORTED_REVENUE_CURRENCIES = new Set(Object.keys(CURRENCY_MINOR_UNIT_DECIMALS));

/**
 * Get the decimal places for minor unit representation of an ISO 4217 currency.
 * @param {string} currency - 3-letter uppercase ISO currency code
 * @returns {number} Number of decimal places (e.g. 0 for TWD/JPY, 2 for USD/EUR)
 */
export function getCurrencyMinorUnitDecimals(currency) {
  const normalized = String(currency || '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNIT_DECIMALS, normalized)) {
    return CURRENCY_MINOR_UNIT_DECIMALS[normalized];
  }
  return 2; // Standard default for ISO 4217
}

/**
 * Parses and validates an integer minor unit amount.
 * Strictly rejects floats, scientific notation, and non-integer values.
 * @param {number|string} value - The minor unit value
 * @param {Object} options - { minimum = 1, maximum = 1_000_000_000 }
 * @returns {number} The integer minor unit amount or NaN if invalid
 */
export function parseMinorUnitAmount(value, { maximum = 1_000_000_000, minimum = 1 } = {}) {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return NaN;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount >= minimum && amount <= maximum ? amount : NaN;
}

/**
 * Normalizes currency for legacy donation paths (constrained to SUPPORTED_DONATION_CURRENCIES).
 * @param {string} value
 * @param {string} fallback
 * @returns {string|null}
 */
export function normalizeCurrency(value, fallback = 'TWD') {
  const currency = String(value || fallback).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) && SUPPORTED_DONATION_CURRENCIES.has(currency) ? currency : null;
}

/**
 * Normalizes and validates ISO 4217 currency for Revenue Events.
 * @param {string} value - 3-letter currency code
 * @param {string|null} fallback - Optional fallback
 * @returns {string|null} Normalized uppercase 3-letter code or null if unsupported
 */
export function normalizeRevenueCurrency(value, fallback = null) {
  const target = value !== undefined && value !== null && String(value).trim() !== '' ? value : fallback;
  if (!target) return null;
  const currency = String(target).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) && SUPPORTED_REVENUE_CURRENCIES.has(currency) ? currency : null;
}

/**
 * Validates a monetary amount and currency pair.
 * @param {number|string} amountMinor
 * @param {string} currency
 * @param {Object} options
 * @returns {{ valueMinor: number, currency: string }|null}
 */
export function validateRevenueMoney(amountMinor, currency, options = {}) {
  const parsedAmount = parseMinorUnitAmount(amountMinor, options);
  const normalizedCurrency = normalizeRevenueCurrency(currency);
  if (!Number.isSafeInteger(parsedAmount) || !normalizedCurrency) {
    return null;
  }
  return {
    valueMinor: parsedAmount,
    currency: normalizedCurrency
  };
}
