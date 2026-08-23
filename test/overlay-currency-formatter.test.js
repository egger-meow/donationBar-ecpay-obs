import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrencyAmount,
  minorToMajor,
  majorToMinor,
  getCurrencyDecimals,
  CURRENCY_DECIMALS,
  CURRENCY_PREFIXES
} from '../public/js/overlay/currency-formatter.js';
import { CURRENCY_MINOR_UNIT_DECIMALS } from '../lib/money.js';

test('CurrencyFormatter: getCurrencyDecimals returns correct decimals', () => {
  assert.equal(getCurrencyDecimals('TWD'), 2);
  assert.equal(getCurrencyDecimals('USD'), 2);
  assert.equal(getCurrencyDecimals('EUR'), 2);
  assert.equal(getCurrencyDecimals('GBP'), 2);
  assert.equal(getCurrencyDecimals('HUF'), 2); // ISO 4217 exponent 2
  assert.equal(getCurrencyDecimals('MXN'), 2);
  assert.equal(getCurrencyDecimals('JPY'), 0);
  assert.equal(getCurrencyDecimals('KRW'), 0);
  assert.equal(getCurrencyDecimals('CLP'), 0);
  assert.equal(getCurrencyDecimals('VND'), 0);
  assert.equal(getCurrencyDecimals('UNKNOWN'), 2);
});

test('CurrencyFormatter: frontend CURRENCY_DECIMALS matches authoritative backend CURRENCY_MINOR_UNIT_DECIMALS', () => {
  // Prevent frontend / backend currency metadata drift
  for (const [currency, decimals] of Object.entries(CURRENCY_MINOR_UNIT_DECIMALS)) {
    assert.equal(
      CURRENCY_DECIMALS[currency],
      decimals,
      `Decimals mismatch for currency ${currency}: frontend=${CURRENCY_DECIMALS[currency]}, backend=${decimals}`
    );
  }
});

test('CurrencyFormatter: minorToMajor and majorToMinor unit conversion', () => {
  // 2-decimal currency (TWD / USD / HUF)
  assert.equal(minorToMajor(1000000, 'TWD'), 10000);
  assert.equal(minorToMajor(125050, 'USD'), 1250.5);
  assert.equal(minorToMajor(100000, 'HUF'), 1000);
  assert.equal(majorToMinor(10000, 'TWD'), 1000000);
  assert.equal(majorToMinor(1250.5, 'USD'), 125050);
  assert.equal(majorToMinor(1000, 'HUF'), 100000);

  // 0-decimal currency (JPY)
  assert.equal(minorToMajor(150000, 'JPY'), 150000);
  assert.equal(majorToMinor(150000, 'JPY'), 150000);
  assert.equal(minorToMajor(300, 'JPY'), 300);
  assert.equal(majorToMinor(300, 'JPY'), 300);
});

test('CurrencyFormatter: formatCurrencyAmount formats TWD correctly', () => {
  // 10,000.00 TWD (1,000,000 minor)
  assert.equal(formatCurrencyAmount(1000000, 'TWD'), 'NT$ 10,000');
  assert.equal(formatCurrencyAmount(742000, 'TWD'), 'NT$ 7,420');
  assert.equal(formatCurrencyAmount(35050, 'TWD'), 'NT$ 350.50');
  assert.equal(formatCurrencyAmount(30000, 'TWD'), 'NT$ 300');
});

test('CurrencyFormatter: formatCurrencyAmount formats USD, EUR, GBP, JPY, HUF correctly', () => {
  // USD
  assert.equal(formatCurrencyAmount(125050, 'USD'), 'US$ 1,250.50');
  assert.equal(formatCurrencyAmount(50000, 'USD'), 'US$ 500');

  // EUR
  assert.equal(formatCurrencyAmount(89000, 'EUR'), '€ 890');
  assert.equal(formatCurrencyAmount(89099, 'EUR'), '€ 890.99');

  // GBP
  assert.equal(formatCurrencyAmount(75000, 'GBP'), '£ 750');

  // JPY (0 decimals)
  assert.equal(formatCurrencyAmount(150000, 'JPY'), '¥ 150,000');
  assert.equal(formatCurrencyAmount(300, 'JPY'), '¥ 300');

  // HUF (2 decimals)
  assert.equal(formatCurrencyAmount(100000, 'HUF'), 'Ft 1,000');
});

test('CurrencyFormatter: options support prefix suppression and custom locale', () => {
  const withoutPrefix = formatCurrencyAmount(500000, 'TWD', { includePrefix: false });
  assert.equal(withoutPrefix, '5,000');

  const zeroAmount = formatCurrencyAmount(0, 'USD');
  assert.equal(zeroAmount, 'US$ 0');
});
