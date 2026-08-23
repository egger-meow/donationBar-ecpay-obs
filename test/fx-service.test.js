import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertCurrencyAmount,
  getExchangeRate,
  FxConversionError,
  FxProvider,
  FixtureFxProvider,
  setFxProvider,
  resetFxProvider,
  REFERENCE_EXCHANGE_RATES_PER_USD
} from '../lib/fx/fx-service.js';

test('getExchangeRate: same currency returns 1.0 with same_currency provenance and system provider', () => {
  const result = getExchangeRate('USD', 'USD');
  assert.equal(result.rate, 1.0);
  assert.equal(result.provenance, 'same_currency');
  assert.equal(result.provider, 'system');
  assert.equal(result.pair, 'USD/USD');

  const twdResult = getExchangeRate('TWD', 'TWD');
  assert.equal(twdResult.rate, 1.0);
  assert.equal(twdResult.provenance, 'same_currency');
  assert.equal(twdResult.provider, 'system');
  assert.equal(twdResult.pair, 'TWD/TWD');
});

test('getExchangeRate: cross currency uses fixture provider rates correctly', () => {
  resetFxProvider();
  // USD -> TWD: 1 USD = 32 TWD
  const usdToTwd = getExchangeRate('USD', 'TWD');
  assert.equal(usdToTwd.rate, 32.0);
  assert.equal(usdToTwd.provenance, 'reference_fixed');
  assert.equal(usdToTwd.provider, 'fixture');
  assert.equal(usdToTwd.pair, 'USD/TWD');

  // TWD -> USD: 1 TWD = 1/32 USD = 0.03125
  const twdToUsd = getExchangeRate('TWD', 'USD');
  assert.equal(twdToUsd.rate, 0.03125);
  assert.equal(twdToUsd.provenance, 'reference_fixed');
  assert.equal(twdToUsd.provider, 'fixture');
  assert.equal(twdToUsd.pair, 'TWD/USD');
});

test('getExchangeRate: customRate override works with custom_override provenance', () => {
  const custom = getExchangeRate('TWD', 'USD', 0.035);
  assert.equal(custom.rate, 0.035);
  assert.equal(custom.provenance, 'custom_override');
  assert.equal(custom.provider, 'creator_override');
  assert.equal(custom.pair, 'TWD/USD');
});

test('getExchangeRate: fails explicitly when rate is unavailable on custom provider', () => {
  class EmptyFxProvider extends FxProvider {
    constructor() {
      super('empty_provider');
    }
    getRate() {
      return null;
    }
  }

  setFxProvider(new EmptyFxProvider());

  try {
    assert.throws(
      () => getExchangeRate('USD', 'EUR'),
      (err) => err instanceof FxConversionError && err.code === 'FX_RATE_UNAVAILABLE'
    );
  } finally {
    resetFxProvider();
  }
});

test('getExchangeRate: throws on invalid currencies or invalid custom rate', () => {
  assert.throws(
    () => getExchangeRate('INVALID', 'USD'),
    (err) => err instanceof FxConversionError && err.code === 'INVALID_FROM_CURRENCY'
  );

  assert.throws(
    () => getExchangeRate('USD', 'INVALID'),
    (err) => err instanceof FxConversionError && err.code === 'INVALID_TO_CURRENCY'
  );

  assert.throws(
    () => getExchangeRate('USD', 'TWD', -5),
    (err) => err instanceof FxConversionError && err.code === 'INVALID_CUSTOM_RATE'
  );
});

test('convertCurrencyAmount: same-currency returns exact minor units without mutation', () => {
  const result = convertCurrencyAmount({
    amountMinor: 50000,
    fromCurrency: 'TWD',
    toCurrency: 'TWD'
  });

  assert.equal(result.sourceAmountMinor, 50000);
  assert.equal(result.sourceCurrency, 'TWD');
  assert.equal(result.targetAmountMinor, 50000);
  assert.equal(result.targetCurrency, 'TWD');
  assert.equal(result.fxRate, 1.0);
  assert.equal(result.fxRateProvenance, 'same_currency');
  assert.equal(result.fxProvider, 'system');
  assert.equal(result.fxPair, 'TWD/TWD');
});

test('convertCurrencyAmount: cross-currency TWD (2-dec) -> USD (2-dec) conversion', () => {
  resetFxProvider();
  // 320.00 TWD = 32000 minor -> 10.00 USD = 1000 minor (at 1 TWD = 0.03125 USD)
  const result = convertCurrencyAmount({
    amountMinor: 32000,
    fromCurrency: 'TWD',
    toCurrency: 'USD'
  });

  assert.equal(result.sourceAmountMinor, 32000);
  assert.equal(result.sourceCurrency, 'TWD');
  assert.equal(result.targetAmountMinor, 1000);
  assert.equal(result.targetCurrency, 'USD');
  assert.equal(result.fxRate, 0.03125);
  assert.equal(result.fxRateProvenance, 'reference_fixed');
  assert.equal(result.fxProvider, 'fixture');
});

test('convertCurrencyAmount: bounded rounding semantics half-up precision', () => {
  // Test half-up rounding boundary
  // 100 USD minor -> EUR with rate 0.925 => 100 * 0.925 = 92.5 => rounds to 93 EUR minor
  const roundUp = convertCurrencyAmount({
    amountMinor: 100,
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    customRate: 0.925
  });
  assert.equal(roundUp.targetAmountMinor, 93);

  // 100 USD minor -> EUR with rate 0.924 => 100 * 0.924 = 92.4 => rounds to 92 EUR minor
  const roundDown = convertCurrencyAmount({
    amountMinor: 100,
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    customRate: 0.924
  });
  assert.equal(roundDown.targetAmountMinor, 92);
});

test('convertCurrencyAmount: cross-currency USD (2-dec) -> TWD (2-dec) conversion', () => {
  resetFxProvider();
  // 15.00 USD = 1500 minor -> 480.00 TWD = 48000 minor (at 1 USD = 32.0 TWD)
  const result = convertCurrencyAmount({
    amountMinor: 1500,
    fromCurrency: 'USD',
    toCurrency: 'TWD'
  });

  assert.equal(result.targetAmountMinor, 48000);
  assert.equal(result.targetCurrency, 'TWD');
  assert.equal(result.fxRate, 32.0);
});

test('convertCurrencyAmount: cross-currency with zero-decimal currency JPY -> USD', () => {
  resetFxProvider();
  // 1550 JPY = 1550 minor (0 decimals) -> 10.00 USD = 1000 minor (2 decimals) (at 1 USD = 155 JPY)
  const result = convertCurrencyAmount({
    amountMinor: 1550,
    fromCurrency: 'JPY',
    toCurrency: 'USD'
  });

  assert.equal(result.sourceAmountMinor, 1550);
  assert.equal(result.sourceCurrency, 'JPY');
  assert.equal(result.targetAmountMinor, 1000);
  assert.equal(result.targetCurrency, 'USD');
  assert.equal(result.fxRateProvenance, 'reference_fixed');
});

test('convertCurrencyAmount: cross-currency USD -> JPY', () => {
  resetFxProvider();
  // 10.00 USD = 1000 minor -> 1550 JPY = 1550 minor
  const result = convertCurrencyAmount({
    amountMinor: 1000,
    fromCurrency: 'USD',
    toCurrency: 'JPY'
  });

  assert.equal(result.targetAmountMinor, 1550);
  assert.equal(result.targetCurrency, 'JPY');
});

test('convertCurrencyAmount: custom exchange rate conversion with provenance', () => {
  // 100.00 USD (10000 minor) -> EUR at custom rate 0.90 -> 90.00 EUR (9000 minor)
  const result = convertCurrencyAmount({
    amountMinor: 10000,
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    customRate: 0.90
  });

  assert.equal(result.targetAmountMinor, 9000);
  assert.equal(result.targetCurrency, 'EUR');
  assert.equal(result.fxRate, 0.90);
  assert.equal(result.fxRateProvenance, 'custom_override');
  assert.equal(result.fxProvider, 'creator_override');
});

test('convertCurrencyAmount: handles zero amount correctly', () => {
  const result = convertCurrencyAmount({
    amountMinor: 0,
    fromCurrency: 'TWD',
    toCurrency: 'USD'
  });

  assert.equal(result.targetAmountMinor, 0);
});

test('convertCurrencyAmount: rejects negative, float or invalid amounts', () => {
  assert.throws(
    () => convertCurrencyAmount({ amountMinor: -100, fromCurrency: 'USD', toCurrency: 'TWD' }),
    (err) => err instanceof FxConversionError && err.code === 'INVALID_AMOUNT'
  );

  assert.throws(
    () => convertCurrencyAmount({ amountMinor: 'abc', fromCurrency: 'USD', toCurrency: 'TWD' }),
    (err) => err instanceof FxConversionError && err.code === 'INVALID_AMOUNT'
  );
});

