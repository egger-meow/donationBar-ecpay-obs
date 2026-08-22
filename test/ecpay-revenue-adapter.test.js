import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEcpayPaidDonation,
  normalizeEcpayPaidRevenueEvent,
  normalizeEcpayReturn,
  normalizeEcpayReturnRevenueEvent
} from '../providers/ecpay-donation-adapter.js';

test('ECPay adapter emits canonical RevenueEvent with ISO 4217 minor units for paid callback', () => {
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
  // 3. ECPay TradeAmt 300 produces canonical TWD 30000
  assert.deepEqual(event.amount, { valueMinor: 30000, currency: 'TWD' });
  assert.deepEqual(event.supporter, { displayName: 'StreamFan', externalUserId: null });
  assert.equal(event.message, 'Great stream!');
  assert.equal(event.isSynthetic, false);
  assert.equal(event.metadata.providerRecordId, 'provider-rec-1');
  assert.equal(event.metadata.paymentType, 'Credit_CreditCard');
});

test('ECPay adapter emits canonical RevenueEvent with ISO 4217 minor units for return callback', () => {
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
  // 500 TWD whole dollars = 50000 ISO minor units
  assert.deepEqual(event.amount, { valueMinor: 50000, currency: 'TWD' });
  assert.equal(event.supporter.displayName, 'ReturnFan');
  assert.equal(event.message, 'Thank you!');
});

test('ECPay adapter rejects unpaid, simulated, or invalid return payloads', () => {
  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '0', TradeAmt: '300' },
    decryptedData: { RtnCode: '1' }
  }), null);

  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '1', TradeAmt: '300' },
    decryptedData: { RtnCode: '1', SimulatePaid: '1' }
  }), null);

  assert.equal(normalizeEcpayReturnRevenueEvent({ RtnCode: '0', TradeAmt: '300' }, { workspaceId: 'ws-1' }), null);
  assert.equal(normalizeEcpayPaidRevenueEvent({}), null);
});

test('ECPay adapter rejects malformed or fractional TradeAmt values safely', () => {
  // Fractional TWD in TradeAmt
  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '1', TradeAmt: '300.5', MerchantTradeNo: 'T1' },
    decryptedData: { RtnCode: '1' }
  }), null);

  // Negative TradeAmt
  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '1', TradeAmt: '-300', MerchantTradeNo: 'T2' },
    decryptedData: { RtnCode: '1' }
  }), null);

  // Non-numeric TradeAmt
  assert.equal(normalizeEcpayPaidRevenueEvent({
    workspaceId: 'ws-1',
    orderInfo: { TradeStatus: '1', TradeAmt: 'abc', MerchantTradeNo: 'T3' },
    decryptedData: { RtnCode: '1' }
  }), null);

  // Zero TradeAmt
  assert.equal(normalizeEcpayReturnRevenueEvent({
    RtnCode: '1',
    MerchantTradeNo: 'T4',
    TradeAmt: '0'
  }, { workspaceId: 'ws-1' }), null);
});

test('legacy ECPay donation normalizers preserve whole-dollar amounts for backward compatibility', () => {
  const legacyPaid = normalizeEcpayPaidDonation({
    orderInfo: { MerchantTradeNo: 'TRADE12345', TradeAmt: '300', TradeStatus: '1' },
    decryptedData: { RtnCode: '1', PatronName: 'StreamFan', PatronNote: 'Hi' }
  });
  assert.equal(legacyPaid.amount, 300);
  assert.equal(legacyPaid.currency, 'TWD');

  const legacyReturn = normalizeEcpayReturn({
    RtnCode: '1',
    MerchantTradeNo: 'TRADE67890',
    TradeAmt: '500',
    CustomField1: 'Fan',
    CustomField2: 'Note'
  });
  assert.equal(legacyReturn.amount, 500);
  assert.equal(legacyReturn.currency, 'TWD');
});
