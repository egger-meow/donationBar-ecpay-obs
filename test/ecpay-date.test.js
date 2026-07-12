import test from 'node:test';
import assert from 'node:assert/strict';
import { formatECPayDate } from '../ecpay-date.js';

test('ECPay order dates use Taiwan time regardless of host timezone', () => {
  assert.equal(formatECPayDate(new Date('2026-01-01T00:00:00.000Z')), '2026/01/01 08:00:00');
  assert.equal(formatECPayDate(new Date('2026-07-12T15:04:05.000Z')), '2026/07/12 23:04:05');
});

test('ECPay date formatter rejects invalid dates', () => {
  assert.throws(() => formatECPayDate(new Date('not-a-date')), /Invalid ECPay date/);
});
