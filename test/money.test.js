import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENCY_MINOR_UNIT_DECIMALS,
  getCurrencyMinorUnitDecimals,
  majorToMinorUnits,
  minorToMajorUnits,
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
  assert.equal(normalizeRevenueCurrency('huf'), 'HUF');
  assert.equal(normalizeRevenueCurrency('invalid'), null);
  assert.equal(normalizeRevenueCurrency('XYZ'), null);
  assert.equal(normalizeRevenueCurrency('', 'USD'), 'USD');
  assert.equal(normalizeRevenueCurrency(null, null), null);
});

test('minor unit decimals are accurately mapped according to ISO 4217 specifications', () => {
  // Exponent 2 currencies
  assert.equal(getCurrencyMinorUnitDecimals('TWD'), 2, 'TWD has ISO 4217 exponent 2 (1 TWD = 100 cents/分)');
  assert.equal(getCurrencyMinorUnitDecimals('HUF'), 2, 'HUF has ISO 4217 exponent 2 (1 HUF = 100 fillér)');
  assert.equal(getCurrencyMinorUnitDecimals('USD'), 2, 'USD has ISO 4217 exponent 2 (1 USD = 100 cents)');
  assert.equal(getCurrencyMinorUnitDecimals('EUR'), 2, 'EUR has ISO 4217 exponent 2 (1 EUR = 100 cents)');
  assert.equal(getCurrencyMinorUnitDecimals('GBP'), 2, 'GBP has ISO 4217 exponent 2 (1 GBP = 100 pence)');

  // Exponent 0 currencies (zero-decimal)
  assert.equal(getCurrencyMinorUnitDecimals('JPY'), 0, 'JPY has ISO 4217 exponent 0');
  assert.equal(getCurrencyMinorUnitDecimals('KRW'), 0, 'KRW has ISO 4217 exponent 0');
  assert.equal(getCurrencyMinorUnitDecimals('CLP'), 0, 'CLP has ISO 4217 exponent 0');
  assert.equal(getCurrencyMinorUnitDecimals('VND'), 0, 'VND has ISO 4217 exponent 0');

  // Fallback default
  assert.equal(getCurrencyMinorUnitDecimals('UNKNOWN'), 2);
});

test('majorToMinorUnits converts major units to canonical ISO minor units without float inaccuracies', () => {
  // 1. USD 10.00 canonical = 1000 minor units
  assert.equal(majorToMinorUnits(10.00, 'USD'), 1000);
  assert.equal(majorToMinorUnits('10.00', 'USD'), 1000);
  assert.equal(majorToMinorUnits('10', 'USD'), 1000);
  assert.equal(majorToMinorUnits('10.5', 'USD'), 1050);
  assert.equal(majorToMinorUnits('0.05', 'USD'), 5);

  // 2. TWD 300 canonical = 30000 ISO minor units
  assert.equal(majorToMinorUnits(300, 'TWD'), 30000);
  assert.equal(majorToMinorUnits('300', 'TWD'), 30000);
  assert.equal(majorToMinorUnits('300.50', 'TWD'), 30050);

  // 4. JPY 300 canonical = 300
  assert.equal(majorToMinorUnits(300, 'JPY'), 300);
  assert.equal(majorToMinorUnits('300', 'JPY'), 300);

  // 5. HUF 500 canonical = 50000
  assert.equal(majorToMinorUnits(500, 'HUF'), 50000);
  assert.equal(majorToMinorUnits('500', 'HUF'), 50000);

  // KRW, CLP, VND zero decimals
  assert.equal(majorToMinorUnits(1000, 'KRW'), 1000);
  assert.equal(majorToMinorUnits(5000, 'CLP'), 5000);
  assert.equal(majorToMinorUnits(20000, 'VND'), 20000);
});

test('majorToMinorUnits rejects malformed, negative, or over-precision values safely', () => {
  assert.ok(Number.isNaN(majorToMinorUnits('10.555', 'USD')), 'USD rejects 3 decimals');
  assert.ok(Number.isNaN(majorToMinorUnits('300.5', 'JPY')), 'JPY rejects fractional amounts');
  assert.ok(Number.isNaN(majorToMinorUnits('300.5', 'KRW')), 'KRW rejects fractional amounts');
  assert.ok(Number.isNaN(majorToMinorUnits('-10', 'USD')), 'Negative numbers rejected');
  assert.ok(Number.isNaN(majorToMinorUnits('abc', 'USD')), 'Non-numeric string rejected');
  assert.ok(Number.isNaN(majorToMinorUnits('', 'USD')), 'Empty string rejected');
  assert.ok(Number.isNaN(majorToMinorUnits(null, 'USD')), 'Null rejected');
  assert.ok(Number.isNaN(majorToMinorUnits(10, 'INVALID')), 'Invalid currency rejected');
});

test('minorToMajorUnits converts canonical ISO minor units to major units', () => {
  assert.equal(minorToMajorUnits(1000, 'USD'), 10);
  assert.equal(minorToMajorUnits(30000, 'TWD'), 300);
  assert.equal(minorToMajorUnits(300, 'JPY'), 300);
  assert.equal(minorToMajorUnits(50000, 'HUF'), 500);
  assert.ok(Number.isNaN(minorToMajorUnits(-100, 'USD')));
  assert.ok(Number.isNaN(minorToMajorUnits('1000', 'USD')));
});

test('validateRevenueMoney enforces integer minor units and valid ISO currency', () => {
  assert.deepEqual(validateRevenueMoney(500, 'USD'), { valueMinor: 500, currency: 'USD' });
  assert.deepEqual(validateRevenueMoney('1000', 'JPY'), { valueMinor: 1000, currency: 'JPY' });
  assert.deepEqual(validateRevenueMoney(30000, 'TWD'), { valueMinor: 30000, currency: 'TWD' });
  assert.equal(validateRevenueMoney('12.50', 'USD'), null);
  assert.equal(validateRevenueMoney(-50, 'USD'), null);
  assert.equal(validateRevenueMoney(500, 'FAKE'), null);
});

