import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEcpayPaidDonation,
  normalizeEcpayPaidRevenueEvent,
  normalizeEcpayReturn,
  normalizeEcpayReturnRevenueEvent
} from '../providers/ecpay-donation-adapter.js';

test('ECPay adapter emits canonical RevenueEvent for paid callback', () => {
  const event = normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-ecpay-1',
    orderInfo: { MerchantTradeNo: 'TRADE12345', TradeAmt: '300', TradeStatus: '1', PaymentType: 'Credit_CreditCard' },
    decryptedData: { RtnCode: '1', PatronName: 'StreamFan', PatronNote: 'Great stream!' },
    providerRecordId: 'provider-rec-1'
  });

  assert.equal(event.workspaceId, 'ws-ecpay-1');
  assert.equal(event.source, 'ecpay');
  assert.equal(event.sourceEventType, 'donation');
  assert.equal(event.externalEventId, 'TRADE12345');
  assert.deepEqual(event.amount, { valueMinor: 300, currency: 'TWD' });
  assert.deepEqual(event.supporter, { displayName: 'StreamFan', externalUserId: null });
  assert.equal(event.message, 'Great stream!');
  assert.equal(event.isSynthetic, false);
  assert.equal(event.metadata.providerRecordId, 'provider-rec-1');
  assert.equal(event.metadata.paymentType, 'Credit_CreditCard');
});

test('ECPay adapter emits canonical RevenueEvent for return callback', () => {
  const event = normalizeEcpayReturnRevenueEvent({
    RtnCode: '1',
    MerchantTradeNo: 'TRADE67890',
    TradeAmt: '500',
    CustomField1: 'ReturnFan',
    CustomField2: 'Thank you!',
    PaymentType: 'ATM'
  }, {
    workspaceId: 'ws-ecpay-2',
    providerRecordId: 'provider-rec-2'
  });

  assert.equal(event.workspaceId, 'ws-ecpay-2');
  assert.equal(event.source, 'ecpay');
  assert.equal(event.externalEventId, 'TRADE67890');
  assert.deepEqual(event.amount, { valueMinor: 500, currency: 'TWD' });
  assert.equal(event.supporter.displayName, 'ReturnFan');
  assert.equal(event.message, 'Thank you!');
});

test('ECPay adapter rejects unpaid, simulated, or invalid return payloads', () => {
  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '0' },
    decryptedData: { RtnCode: '1' }
  }), null);

  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '1' },
    decryptedData: { RtnCode: '1', SimulatePaid: '1' }
  }), null);

  assert.equal(normalizeEcpayReturnRevenueEvent({ RtnCode: '0' }, { workspaceId: 'ws-1' }), null);
  assert.equal(normalizeEcpayPaidRevenueEvent({}), null);
});
