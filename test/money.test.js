import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCurrency, parseMinorUnitAmount } from '../money.js';

test('donation amounts accept only positive integer minor units within the provider limit', () => {
  assert.equal(parseMinorUnitAmount('70'), 70);
  assert.equal(parseMinorUnitAmount(100), 100);
  for (const invalid of ['', '1.0', '1.5', '-1', '1e2', 'abc', '1000001']) {
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
