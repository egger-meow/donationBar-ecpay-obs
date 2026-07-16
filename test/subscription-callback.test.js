import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCheckMacValueForCredentials } from '../lib/ecpay.js';
import { processSubscriptionPaymentCallback } from '../lib/subscription-callback.js';

const credentials = { merchantId: 'merchant-1', hashKey: '12345678901234567890123456789012', hashIV: '1234567890123456' };

function payload(overrides = {}) {
  const value = {
    MerchantID: credentials.merchantId, CustomField1: 'user-1', TradeNo: 'trade-1', MerchantTradeNo: 'merchant-trade-1',
    PeriodAmount: '299', RtnCode: '1', PaymentDate: '2026/07/11 12:00:00', PaymentType: 'Credit', ...overrides
  };
  value.CheckMacValue = generateCheckMacValueForCredentials(value, credentials);
  return value;
}

function database({ duplicate = false } = {}) {
  const calls = { payments: [], updates: [] };
  return {
    calls,
    async getUserSubscription(userId) { return { id: 'sub-1', userId, pricePerMonth: 299, failedPaymentCount: 2, ecpayMerchantTradeNo: 'merchant-trade-1' }; },
    async createPaymentRecord(record) { calls.payments.push(record); return { id: 'payment-1', wasDuplicate: duplicate }; },
    async updateSubscription(userId, update) { calls.updates.push({ userId, update }); }
  };
}

test('recurring success persists once and activates the expected subscription', async () => {
  const store = database();
  const result = await processSubscriptionPaymentCallback(payload(), { credentials, database: store, monthlyPrice: '299' });
  assert.deepEqual(result, { ok: true, success: true });
  assert.equal(store.calls.payments.length, 1);
  assert.equal(store.calls.updates.length, 1);
  assert.equal(store.calls.updates[0].update.status, 'active');
  assert.equal(store.calls.updates[0].update.failedPaymentCount, 0);
});

test('recurring failure records failure without activating subscription', async () => {
  const store = database();
  const result = await processSubscriptionPaymentCallback(payload({ RtnCode: '0', RtnMsg: 'declined' }), { credentials, database: store, monthlyPrice: '299' });
  assert.deepEqual(result, { ok: true, success: false });
  assert.equal(store.calls.updates[0].update.lastPaymentStatus, 'failed');
  assert.equal(store.calls.updates[0].update.failedPaymentCount, 3);
});

test('invalid signature and wrong amount never persist or mutate subscription', async () => {
  const badSignatureStore = database();
  const signed = payload();
  signed.CheckMacValue = '0'.repeat(64);
  assert.deepEqual(await processSubscriptionPaymentCallback(signed, { credentials, database: badSignatureStore, monthlyPrice: '299' }), { ok: false, status: 400, message: '0|Invalid checksum' });
  assert.equal(badSignatureStore.calls.payments.length, 0);

  const wrongAmountStore = database();
  assert.deepEqual(await processSubscriptionPaymentCallback(payload({ PeriodAmount: '1' }), { credentials, database: wrongAmountStore, monthlyPrice: '299' }), { ok: false, status: 400, message: '0|Invalid payment amount' });
  assert.equal(wrongAmountStore.calls.payments.length, 0);

  const decimalAmountStore = database();
  assert.deepEqual(await processSubscriptionPaymentCallback(payload({ PeriodAmount: '299.5' }), { credentials, database: decimalAmountStore, monthlyPrice: '299' }), { ok: false, status: 400, message: '0|Invalid payment data' });
  assert.equal(decimalAmountStore.calls.payments.length, 0);
});

test('duplicate callbacks never mutate subscription a second time', async () => {
  const store = database({ duplicate: true });
  assert.deepEqual(await processSubscriptionPaymentCallback(payload(), { credentials, database: store, monthlyPrice: '299' }), { ok: true, success: true, duplicate: true });
  assert.equal(store.calls.payments.length, 1);
  assert.equal(store.calls.updates.length, 0);
});
