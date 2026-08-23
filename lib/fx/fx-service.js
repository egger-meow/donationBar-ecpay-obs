import {
  getCurrencyMinorUnitDecimals,
  minorToMajorUnits,
  normalizeRevenueCurrency,
  parseMinorUnitAmount,
  SUPPORTED_REVENUE_CURRENCIES
} from '../money.js';

/**
 * Standard reference exchange rates per 1 USD (Base = USD) used as deterministic test fixtures.
 * Note: ISO 4217 defines currencies and minor units, not market exchange rates.
 * In production, exchange rates must come from configured overrides or an explicit FX provider.
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
 * Base FX Provider Interface.
 */
export class FxProvider {
  constructor(name = 'custom_provider') {
    this.name = name;
  }

  /**
   * @param {string} fromCurrency
   * @param {string} toCurrency
   * @returns {{ rate: number, provider: string, timestamp: string, provenance: string } | null}
   */
  getRate(fromCurrency, toCurrency) {
    throw new Error('getRate must be implemented by subclass');
  }
}

/**
 * Deterministic Test Fixture Provider.
 */
export class FixtureFxProvider extends FxProvider {
  constructor(ratesPerUsd = REFERENCE_EXCHANGE_RATES_PER_USD) {
    super('fixture');
    this.ratesPerUsd = { ...ratesPerUsd };
  }

  getRate(fromCurrency, toCurrency) {
    const rateFrom = this.ratesPerUsd[fromCurrency];
    const rateTo = this.ratesPerUsd[toCurrency];

    if (!rateFrom || !rateTo) {
      return null;
    }

    const rate = rateTo / rateFrom;
    return {
      rate,
      provider: 'fixture',
      provenance: 'reference_fixed',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Global active FX provider reference.
 */
let activeFxProvider = new FixtureFxProvider();

export function setFxProvider(provider) {
  activeFxProvider = provider;
}

export function getFxProvider() {
  return activeFxProvider;
}

export function resetFxProvider() {
  activeFxProvider = new FixtureFxProvider();
}

/**
 * Calculate the exchange rate from fromCurrency to toCurrency.
 * Rate defines: 1 major unit of fromCurrency = (rate) major units of toCurrency.
 *
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {Object|number|null} [optionsOrCustomRate]
 * @returns {{
 *   rate: number,
 *   provenance: string,
 *   provider: string,
 *   timestamp: string,
 *   pair: string
 * }}
 */
export function getExchangeRate(fromCurrency, toCurrency, optionsOrCustomRate = null) {
  const normFrom = normalizeRevenueCurrency(fromCurrency);
  const normTo = normalizeRevenueCurrency(toCurrency);

  if (!normFrom) {
    throw new FxConversionError(`Unsupported source currency: ${fromCurrency}`, 'INVALID_FROM_CURRENCY');
  }
  if (!normTo) {
    throw new FxConversionError(`Unsupported target currency: ${toCurrency}`, 'INVALID_TO_CURRENCY');
  }

  const nowIso = new Date().toISOString();
  const pair = `${normFrom}/${normTo}`;

  // 1. Same currency is always exact 1.0 without provider lookup
  if (normFrom === normTo) {
    return {
      rate: 1.0,
      provenance: 'same_currency',
      provider: 'system',
      timestamp: nowIso,
      pair
    };
  }

  let customRate = null;
  let explicitProvider = null;

  if (typeof optionsOrCustomRate === 'number' || (typeof optionsOrCustomRate === 'string' && optionsOrCustomRate !== '')) {
    customRate = optionsOrCustomRate;
  } else if (optionsOrCustomRate && typeof optionsOrCustomRate === 'object') {
    customRate = optionsOrCustomRate.customRate ?? null;
    explicitProvider = optionsOrCustomRate.provider ?? null;
  }

  // 2. Creator-configured custom rate override
  if (customRate !== null && customRate !== undefined) {
    const parsedCustom = Number(customRate);
    if (!Number.isFinite(parsedCustom) || parsedCustom <= 0) {
      throw new FxConversionError(`Invalid custom exchange rate: ${customRate}`, 'INVALID_CUSTOM_RATE');
    }
    return {
      rate: parsedCustom,
      provenance: 'custom_override',
      provider: 'creator_override',
      timestamp: nowIso,
      pair
    };
  }

  // 3. Query provider
  const providerToUse = explicitProvider || activeFxProvider;

  if (!providerToUse) {
    throw new FxConversionError(
      `No FX rate provider configured to convert ${normFrom} to ${normTo}`,
      'FX_RATE_UNAVAILABLE',
      { from: normFrom, to: normTo }
    );
  }

  const providerResult = providerToUse.getRate(normFrom, normTo);

  if (!providerResult || !Number.isFinite(providerResult.rate) || providerResult.rate <= 0) {
    throw new FxConversionError(
      `Exchange rate unavailable between ${normFrom} and ${normTo}`,
      'FX_RATE_UNAVAILABLE',
      { from: normFrom, to: normTo, provider: providerToUse.name }
    );
  }

  return {
    rate: providerResult.rate,
    provenance: providerResult.provenance || 'fx_provider',
    provider: providerResult.provider || providerToUse.name || 'fx_provider',
    timestamp: providerResult.timestamp || nowIso,
    pair
  };
}

/**
 * Deterministically converts a minor-unit amount from one ISO 4217 currency to another.
 * Historical conversions remain immutable because rate, provenance, provider and timestamp
 * are returned and persisted alongside the calculated minor units.
 *
 * Bounded Rounding Semantics:
 * Uses standard half-up integer rounding (Math.round) to the nearest integer minor unit.
 * Intermediate multiplications scale using standard IEEE-754 precision bounded within safe integers.
 *
 * @param {Object} params
 * @param {number|string} params.amountMinor - Source amount in integer minor units
 * @param {string} params.fromCurrency - Source ISO 4217 currency code
 * @param {string} params.toCurrency - Target ISO 4217 currency code
 * @param {number|null} [params.customRate] - Optional custom exchange rate override
 * @param {Object|null} [params.fxProvider] - Optional explicit FX provider
 * @returns {{
 *   sourceAmountMinor: number,
 *   sourceCurrency: string,
 *   targetAmountMinor: number,
 *   targetCurrency: string,
 *   fxRate: number,
 *   fxRateProvenance: string,
 *   fxProvider: string,
 *   fxTimestamp: string,
 *   fxPair: string
 * }}
 */
export function convertCurrencyAmount({
  amountMinor,
  fromCurrency,
  toCurrency,
  customRate = null,
  fxProvider = null
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

  const nowIso = new Date().toISOString();
  const pair = `${normFrom}/${normTo}`;

  if (normFrom === normTo) {
    return {
      sourceAmountMinor: parsedMinor,
      sourceCurrency: normFrom,
      targetAmountMinor: parsedMinor,
      targetCurrency: normTo,
      fxRate: 1.0,
      fxRateProvenance: 'same_currency',
      fxProvider: 'system',
      fxTimestamp: nowIso,
      fxPair: pair
    };
  }

  const rateInfo = getExchangeRate(normFrom, normTo, {
    customRate,
    provider: fxProvider
  });

  // Convert source minor units -> source major units
  const sourceMajor = minorToMajorUnits(parsedMinor, normFrom);

  // Calculate target major units
  const targetMajor = sourceMajor * rateInfo.rate;

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
    fxRate: rateInfo.rate,
    fxRateProvenance: rateInfo.provenance,
    fxProvider: rateInfo.provider,
    fxTimestamp: rateInfo.timestamp,
    fxPair: rateInfo.pair
  };
}

export default {
  REFERENCE_EXCHANGE_RATES_PER_USD,
  FxConversionError,
  FxProvider,
  FixtureFxProvider,
  setFxProvider,
  getFxProvider,
  resetFxProvider,
  getExchangeRate,
  convertCurrencyAmount
};
