import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDonationEvent, normalizeDonationEvent } from '../donation-event.js';
import { normalizeEcpayPaidDonation, normalizeEcpayReturn } from '../providers/ecpay-donation-adapter.js';

test('ECPay adapter emits the canonical provider-independent donation event', () => {
  const event = normalizeEcpayPaidDonation({
    orderInfo: { MerchantTradeNo: 'DONATE123', TradeAmt: '250', TradeStatus: '1' },
    decryptedData: { RtnCode: '1', PatronName: 'Viewer', PatronNote: 'Thanks' },
    providerRecordId: 'provider-1'
  });
  assert.deepEqual(event, {
    provider: 'ecpay',
    externalId: 'DONATE123',
    amount: 250,
    currency: 'TWD',
    payer: 'Viewer',
    message: 'Thanks',
    providerRecordId: 'provider-1'
  });
});

test('ECPay adapter rejects unpaid and simulated payloads before persistence', () => {
  assert.equal(normalizeEcpayPaidDonation({ orderInfo: { TradeStatus: '0' }, decryptedData: { RtnCode: '1' } }), null);
  assert.equal(normalizeEcpayPaidDonation({ orderInfo: { TradeStatus: '1' }, decryptedData: { RtnCode: '1', SimulatePaid: '1' } }), null);
  assert.equal(normalizeEcpayReturn({ RtnCode: '0' }), null);
});

test('test adapter is provider-safe and shares the canonical event shape', () => {
  const event = createTestDonationEvent({ externalId: 'TEST123', amount: '100', payer: 'Tester' });
  assert.equal(event.provider, 'test');
  assert.equal(event.amount, 100);
  assert.equal(Object.isFrozen(event), true);
});

test('canonical donation events reject malformed provider-independent input', () => {
  assert.throws(() => normalizeDonationEvent({ provider: 'ecpay', externalId: 'bad id', amount: 100 }), /external ID/);
  assert.throws(() => normalizeDonationEvent({ provider: 'ecpay', externalId: 'X1', amount: '1.5' }), /amount/);
});
