import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrencyMinorUnitDecimals,
  normalizeCurrency,
  normalizeRevenueCurrency,
  parseMinorUnitAmount,
  SUPPORTED_REVENUE_CURRENCIES,
  validateRevenueMoney
} from '../lib/money.js';

test('donation amounts accept only positive integer minor units within the provider limit', () => {
  assert.equal(parseMinorUnitAmount('70'), 70);
  assert.equal(parseMinorUnitAmount(100), 100);
  assert.equal(parseMinorUnitAmount('0', { minimum: 0 }), 0);
  for (const invalid of ['', '1.0', '1.5', '-1', '1e2', 'abc', '1000000001']) {
    assert.ok(Number.isNaN(parseMinorUnitAmount(invalid)), `expected ${invalid} to be rejected`);
  }
});

test('donation currency is normalized as a three-letter ISO-style code', () => {
  assert.equal(normalizeCurrency('twd'), 'TWD');
  assert.equal(normalizeCurrency(undefined), 'TWD');
  assert.equal(normalizeCurrency('NTD'), null);
  assert.equal(normalizeCurrency('TWD '), 'TWD');
  assert.equal(normalizeCurrency('TWD$'), null);
});

test('revenue currencies support global ISO 4217 standard codes', () => {
  assert.equal(normalizeRevenueCurrency('usd'), 'USD');
  assert.equal(normalizeRevenueCurrency('EUR'), 'EUR');
  assert.equal(normalizeRevenueCurrency('jpy'), 'JPY');
  assert.equal(normalizeRevenueCurrency('twd'), 'TWD');
  assert.equal(normalizeRevenueCurrency('gbp'), 'GBP');
  assert.equal(normalizeRevenueCurrency('invalid'), null);
  assert.equal(normalizeRevenueCurrency('XYZ'), null);
  assert.equal(normalizeRevenueCurrency('', 'USD'), 'USD');
  assert.equal(normalizeRevenueCurrency(null, null), null);
});

test('minor unit decimals are accurately mapped for zero-decimal and two-decimal currencies', () => {
  assert.equal(getCurrencyMinorUnitDecimals('TWD'), 0);
  assert.equal(getCurrencyMinorUnitDecimals('JPY'), 0);
  assert.equal(getCurrencyMinorUnitDecimals('KRW'), 0);
  assert.equal(getCurrencyMinorUnitDecimals('USD'), 2);
  assert.equal(getCurrencyMinorUnitDecimals('EUR'), 2);
  assert.equal(getCurrencyMinorUnitDecimals('GBP'), 2);
  assert.equal(getCurrencyMinorUnitDecimals('UNKNOWN'), 2);
});

test('validateRevenueMoney enforces integer minor units and valid ISO currency', () => {
  assert.deepEqual(validateRevenueMoney(500, 'USD'), { valueMinor: 500, currency: 'USD' });
  assert.deepEqual(validateRevenueMoney('1000', 'JPY'), { valueMinor: 1000, currency: 'JPY' });
  assert.equal(validateRevenueMoney('12.50', 'USD'), null);
  assert.equal(validateRevenueMoney(-50, 'USD'), null);
  assert.equal(validateRevenueMoney(500, 'FAKE'), null);
});

