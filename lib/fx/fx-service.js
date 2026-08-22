import {
  getCurrencyMinorUnitDecimals,
  minorToMajorUnits,
  normalizeRevenueCurrency,
  parseMinorUnitAmount,
  SUPPORTED_REVENUE_CURRENCIES
} from '../money.js';

/**
 * Standard reference exchange rates per 1 USD (Base = USD).
 * Provides deterministic conversion across all supported ISO 4217 revenue currencies.
 */
export const REFERENCE_EXCHANGE_RATES_PER_USD = Object.freeze({
  USD: 1.0,
  TWD: 32.0,       // 1 USD = 32.00 TWD (1 TWD = 0.03125 USD)
  EUR: 0.92,       // 1 USD = 0.92 EUR (1 EUR ≈ 1.08695652 USD)
  GBP: 0.78,       // 1 USD = 0.78 GBP (1 GBP ≈ 1.28205128 USD)
  JPY: 155.0,      // 1 USD = 155 JPY (1 JPY ≈ 0.00645161 USD)
  KRW: 1350.0,     // 1 USD = 1350 KRW
  CAD: 1.36,
  AUD: 1.50,
  SGD: 1.35,
  HKD: 7.80,
  NZD: 1.65,
  CHF: 0.90,
  BRL: 5.40,
  MYR: 4.40,
  PHP: 56.0,
  THB: 35.0,
  INR: 83.5,
  SEK: 10.5,
  NOK: 10.8,
  DKK: 6.85,
  PLN: 3.95,
  HUF: 360.0,
  CZK: 23.0,
  ILS: 3.70,
  CLP: 930.0,
  VND: 25000.0,
  ZAR: 18.2
});

export class FxConversionError extends Error {
  constructor(message, code = 'FX_CONVERSION_ERROR', details = {}) {
    super(message);
    this.name = 'FxConversionError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Calculate the exchange rate from fromCurrency to toCurrency.
 * Rate defines: 1 major unit of fromCurrency = (rate) major units of toCurrency.
 *
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {number|null} customRate
 * @returns {{ rate: number, provenance: string }}
 */
export function getExchangeRate(fromCurrency, toCurrency, customRate = null) {
  const normFrom = normalizeRevenueCurrency(fromCurrency);
  const normTo = normalizeRevenueCurrency(toCurrency);

  if (!normFrom) {
    throw new FxConversionError(`Unsupported source currency: ${fromCurrency}`, 'INVALID_FROM_CURRENCY');
  }
  if (!normTo) {
    throw new FxConversionError(`Unsupported target currency: ${toCurrency}`, 'INVALID_TO_CURRENCY');
  }

  if (normFrom === normTo) {
    return {
      rate: 1.0,
      provenance: 'same_currency'
    };
  }

  if (customRate !== null && customRate !== undefined) {
    const parsedCustom = Number(customRate);
    if (!Number.isFinite(parsedCustom) || parsedCustom <= 0) {
      throw new FxConversionError(`Invalid custom exchange rate: ${customRate}`, 'INVALID_CUSTOM_RATE');
    }
    return {
      rate: parsedCustom,
      provenance: 'custom_override'
    };
  }

  const rateFrom = REFERENCE_EXCHANGE_RATES_PER_USD[normFrom];
  const rateTo = REFERENCE_EXCHANGE_RATES_PER_USD[normTo];

  if (!rateFrom || !rateTo) {
    throw new FxConversionError(
      `No exchange rate available between ${normFrom} and ${normTo}`,
      'UNSUPPORTED_CURRENCY_PAIR',
      { from: normFrom, to: normTo }
    );
  }

  // 1 unit of fromCurrency = (rateTo / rateFrom) units of toCurrency
  const rate = rateTo / rateFrom;

  return {
    rate,
    provenance: 'reference_fixed'
  };
}

/**
 * Deterministically converts a minor-unit amount from one ISO 4217 currency to another.
 * Historical conversions remain immutable because rate and provenance are returned
 * and persisted alongside the calculated minor units.
 *
 * @param {Object} params
 * @param {number|string} params.amountMinor - Source amount in integer minor units
 * @param {string} params.fromCurrency - Source ISO 4217 currency code
 * @param {string} params.toCurrency - Target ISO 4217 currency code
 * @param {number|null} [params.customRate] - Optional custom exchange rate override
 * @returns {{
 *   sourceAmountMinor: number,
 *   sourceCurrency: string,
 *   targetAmountMinor: number,
 *   targetCurrency: string,
 *   fxRate: number,
 *   fxRateProvenance: string
 * }}
 */
export function convertCurrencyAmount({
  amountMinor,
  fromCurrency,
  toCurrency,
  customRate = null
}) {
  const normFrom = normalizeRevenueCurrency(fromCurrency);
  const normTo = normalizeRevenueCurrency(toCurrency);
  const parsedMinor = parseMinorUnitAmount(amountMinor, { minimum: 0 });

  if (!normFrom) {
    throw new FxConversionError(`Invalid or unsupported source currency: ${fromCurrency}`, 'INVALID_FROM_CURRENCY');
  }
  if (!normTo) {
    throw new FxConversionError(`Invalid or unsupported target currency: ${toCurrency}`, 'INVALID_TO_CURRENCY');
  }
  if (!Number.isSafeInteger(parsedMinor)) {
    throw new FxConversionError(`Invalid minor unit amount: ${amountMinor}`, 'INVALID_AMOUNT');
  }

  if (normFrom === normTo) {
    return {
      sourceAmountMinor: parsedMinor,
      sourceCurrency: normFrom,
      targetAmountMinor: parsedMinor,
      targetCurrency: normTo,
      fxRate: 1.0,
      fxRateProvenance: 'same_currency'
    };
  }

  const { rate, provenance } = getExchangeRate(normFrom, normTo, customRate);

  // Convert source minor units -> source major units
  const sourceMajor = minorToMajorUnits(parsedMinor, normFrom);

  // Calculate target major units
  const targetMajor = sourceMajor * rate;

  // Convert target major units -> target integer minor units
  const targetDecimals = getCurrencyMinorUnitDecimals(normTo);
  const multiplier = Math.pow(10, targetDecimals);
  const targetMinor = Math.round(targetMajor * multiplier);

  if (!Number.isSafeInteger(targetMinor) || targetMinor < 0) {
    throw new FxConversionError('Converted target amount exceeds safe integer range', 'OVERFLOW');
  }

  return {
    sourceAmountMinor: parsedMinor,
    sourceCurrency: normFrom,
    targetAmountMinor: targetMinor,
    targetCurrency: normTo,
    fxRate: rate,
    fxRateProvenance: provenance
  };
}

export default {
  REFERENCE_EXCHANGE_RATES_PER_USD,
  FxConversionError,
  getExchangeRate,
  convertCurrencyAmount
};
