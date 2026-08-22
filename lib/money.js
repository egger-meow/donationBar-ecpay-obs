// Monetary values are persisted as integer minor units with an explicit ISO 4217 code.
// ECPay currently settles DonationBar donations in TWD.
// The Universal Revenue Event Core supports global ISO 4217 currencies for multi-source revenue aggregation.

export const SUPPORTED_DONATION_CURRENCIES = new Set(['TWD']);

export const CURRENCY_MINOR_UNIT_DECIMALS = Object.freeze({
  TWD: 2, // New Taiwan Dollar: ISO 4217 exponent 2 (1 TWD = 100 minor units / cents)
  HUF: 2, // Hungarian Forint: ISO 4217 exponent 2 (1 HUF = 100 minor units / fillér)
  JPY: 0, // Japanese Yen: ISO 4217 exponent 0 (0 minor unit decimals)
  KRW: 0, // South Korean Won: ISO 4217 exponent 0
  CLP: 0, // Chilean Peso: ISO 4217 exponent 0
  VND: 0, // Vietnamese Dong: ISO 4217 exponent 0
  USD: 2, // US Dollar: ISO 4217 exponent 2 (1 USD = 100 cents)
  EUR: 2, // Euro: ISO 4217 exponent 2
  GBP: 2, // Pound Sterling: ISO 4217 exponent 2
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
 * @returns {number} Number of decimal places (e.g. 0 for JPY/KRW, 2 for TWD/USD/EUR/HUF)
 */
export function getCurrencyMinorUnitDecimals(currency) {
  const normalized = String(currency || '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNIT_DECIMALS, normalized)) {
    return CURRENCY_MINOR_UNIT_DECIMALS[normalized];
  }
  return 2; // Standard default for ISO 4217
}

/**
 * Safely converts an amount from currency major units (e.g. 10.00 USD, 300 TWD, 300 JPY)
 * to canonical ISO 4217 integer minor units (e.g. 1000 for USD, 30000 for TWD, 300 for JPY).
 * Strictly avoids floating-point inaccuracies.
 *
 * @param {number|string} amountMajor - Value in major currency units
 * @param {string} currency - 3-letter uppercase ISO currency code
 * @returns {number} Canonical integer minor units, or NaN if invalid
 */
export function majorToMinorUnits(amountMajor, currency) {
  const normCurrency = normalizeRevenueCurrency(currency);
  if (!normCurrency) return NaN;

  const decimals = getCurrencyMinorUnitDecimals(normCurrency);
  const text = typeof amountMajor === 'number' ? String(amountMajor) : String(amountMajor ?? '').trim();

  // Validate format: digits optionally followed by a single decimal point and digits
  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;

  const parts = text.split('.');
  const wholePart = parts[0];
  const fracPart = parts[1] || '';

  // Reject fractional precision that exceeds the currency's ISO exponent
  if (fracPart.length > decimals) return NaN;

  // Pad fractional part with zeros up to decimals length
  const paddedFrac = fracPart.padEnd(decimals, '0');
  const combined = wholePart + paddedFrac;

  const minorInt = Number(combined);
  if (!Number.isSafeInteger(minorInt) || minorInt < 0) return NaN;

  return minorInt;
}

/**
 * Converts canonical ISO 4217 integer minor units back to major unit number.
 * @param {number} amountMinor - Integer minor units
 * @param {string} currency - 3-letter uppercase ISO currency code
 * @returns {number} Amount in major units, or NaN if invalid
 */
export function minorToMajorUnits(amountMinor, currency) {
  const normCurrency = normalizeRevenueCurrency(currency);
  if (!normCurrency) return NaN;
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return NaN;

  const decimals = getCurrencyMinorUnitDecimals(normCurrency);
  if (decimals === 0) return amountMinor;
  return amountMinor / Math.pow(10, decimals);
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
