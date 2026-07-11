import test from 'node:test';
import assert from 'node:assert/strict';

function strictAmount(value) {
  const text = String(value ?? '').trim();
  return /^\d{1,9}$/.test(text) ? Number(text) : NaN;
}

test('payment amounts must be strict integer strings', () => {
  assert.equal(strictAmount('70'), 70);
  assert.ok(Number.isNaN(strictAmount('70abc')));
  assert.ok(Number.isNaN(strictAmount('1.0')));
  assert.ok(Number.isNaN(strictAmount('-1')));
});
