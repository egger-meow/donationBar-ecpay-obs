/**
 * Currency and Number Formatter for Donatio OBS Overlay
 * Provides locale-aware, human-friendly formatting across all supported ISO 4217 currencies.
 */

export const CURRENCY_DECIMALS = Object.freeze({
  TWD: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
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
  HUF: 0,
  CZK: 2,
  ILS: 2,
  CLP: 0,
  VND: 0,
  ZAR: 2
});

export const CURRENCY_PREFIXES = Object.freeze({
  TWD: 'NT$ ',
  USD: 'US$ ',
  EUR: '€ ',
  GBP: '£ ',
  JPY: '¥ ',
  KRW: '₩ ',
  CAD: 'CA$ ',
  AUD: 'AU$ ',
  SGD: 'SG$ ',
  HKD: 'HK$ ',
  NZD: 'NZ$ ',
  CHF: 'CHF ',
  BRL: 'R$ ',
  MYR: 'RM ',
  PHP: '₱ ',
  THB: '฿ ',
  INR: '₹ ',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
  PLN: 'zł ',
  HUF: 'Ft ',
  CZK: 'Kč ',
  ILS: '₪ ',
  CLP: 'CLP$ ',
  VND: '₫ ',
  ZAR: 'R '
});

/**
 * Gets the number of minor unit decimals for an ISO 4217 currency.
 * @param {string} currency
 * @returns {number}
 */
export function getCurrencyDecimals(currency) {
  const code = String(currency || 'TWD').trim().toUpperCase();
  return CURRENCY_DECIMALS[code] ?? 2;
}

/**
 * Converts integer minor units to standard major numerical units.
 * @param {number|string} minorUnits
 * @param {string} currency
 * @returns {number}
 */
export function minorToMajor(minorUnits, currency = 'TWD') {
  const num = Number(minorUnits);
  if (!Number.isFinite(num)) return 0;
  const decimals = getCurrencyDecimals(currency);
  if (decimals === 0) return Math.round(num);
  return num / Math.pow(10, decimals);
}

/**
 * Converts standard major numerical units to integer minor units.
 * @param {number|string} majorUnits
 * @param {string} currency
 * @returns {number}
 */
export function majorToMinor(majorUnits, currency = 'TWD') {
  const num = Number(majorUnits);
  if (!Number.isFinite(num)) return 0;
  const decimals = getCurrencyDecimals(currency);
  if (decimals === 0) return Math.round(num);
  return Math.round(num * Math.pow(10, decimals));
}

/**
 * Formats a major numerical amount with thousands separators and appropriate decimal places.
 * @param {number} majorAmount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatNumberWithDecimals(majorAmount, currency = 'TWD', locale = 'zh-TW') {
  const decimals = getCurrencyDecimals(currency);
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals === 0 ? 0 : (majorAmount % 1 === 0 ? 0 : decimals),
    maximumFractionDigits: decimals
  });
  return formatter.format(majorAmount);
}

/**
 * Formats an amount in minor units with currency symbol and locale formatting.
 * Example:
 * - 1000000 TWD minor -> "NT$ 10,000"
 * - 125050 USD minor -> "US$ 1,250.50"
 * - 150000 JPY minor -> "¥ 150,000"
 *
 * @param {number|string} amountMinor
 * @param {string} [currency='TWD']
 * @param {Object} [options]
 * @param {string} [options.locale='zh-TW']
 * @param {boolean} [options.includePrefix=true]
 * @returns {string}
 */
export function formatCurrencyAmount(amountMinor, currency = 'TWD', options = {}) {
  const code = String(currency || 'TWD').trim().toUpperCase();
  const major = minorToMajor(amountMinor, code);
  const locale = options.locale || 'zh-TW';
  const includePrefix = options.includePrefix !== false;
  
  const formattedNum = formatNumberWithDecimals(major, code, locale);
  const prefix = includePrefix ? (CURRENCY_PREFIXES[code] || `${code} `) : '';
  return `${prefix}${formattedNum}`;
}

export default {
  CURRENCY_DECIMALS,
  CURRENCY_PREFIXES,
  getCurrencyDecimals,
  minorToMajor,
  majorToMinor,
  formatNumberWithDecimals,
  formatCurrencyAmount
};
