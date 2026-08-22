import { normalizeDonationEvent } from '../lib/donation-event.js';
import { normalizeRevenueEvent } from '../lib/revenue-event.js';

// Canonical Revenue Event normalizers for ECPay
export function normalizeEcpayPaidRevenueEvent({ workspaceId, orderInfo = {}, decryptedData = {}, providerRecordId = null } = {}) {
  if (!workspaceId) return null;
  if (Number(decryptedData.RtnCode) !== 1 || Number(decryptedData.SimulatePaid) === 1) return null;
  if (Number(orderInfo.TradeStatus) !== 1) return null;
  return normalizeRevenueEvent({
    workspaceId,
    source: 'ecpay',
    sourceEventType: 'donation',
    externalEventId: orderInfo.MerchantTradeNo,
    amount: {
      valueMinor: orderInfo.TradeAmt,
      currency: 'TWD'
    },
    supporter: {
      displayName: decryptedData.PatronName || '匿名'
    },
    message: decryptedData.PatronNote || '',
    isSynthetic: false,
    metadata: {
      providerRecordId: providerRecordId || null,
      paymentType: orderInfo.PaymentType || 'ECPay'
    }
  });
}

export function normalizeEcpayReturnRevenueEvent(payload = {}, { workspaceId, providerRecordId = null } = {}) {
  if (!workspaceId) return null;
  if (String(payload.RtnCode) !== '1') return null;
  return normalizeRevenueEvent({
    workspaceId,
    source: 'ecpay',
    sourceEventType: 'donation',
    externalEventId: payload.MerchantTradeNo,
    amount: {
      valueMinor: payload.TradeAmt,
      currency: 'TWD'
    },
    supporter: {
      displayName: payload.CustomField1 || '匿名'
    },
    message: payload.CustomField2 || '',
    isSynthetic: false,
    metadata: {
      providerRecordId: providerRecordId || null,
      paymentType: payload.PaymentType || 'ECPay'
    }
  });
}

// Legacy thin donation event normalizers (preserved for downstream backward-compatibility)
export function normalizeEcpayPaidDonation({ orderInfo = {}, decryptedData = {}, providerRecordId = null } = {}) {
  if (Number(decryptedData.RtnCode) !== 1 || Number(decryptedData.SimulatePaid) === 1) return null;
  if (Number(orderInfo.TradeStatus) !== 1) return null;
  return normalizeDonationEvent({
    provider: 'ecpay',
    externalId: orderInfo.MerchantTradeNo,
    amount: orderInfo.TradeAmt,
    currency: 'TWD',
    payer: decryptedData.PatronName,
    message: decryptedData.PatronNote,
    providerRecordId
  });
}

export function normalizeEcpayReturn(payload = {}, { providerRecordId = null } = {}) {
  if (String(payload.RtnCode) !== '1') return null;
  return normalizeDonationEvent({
    provider: 'ecpay',
    externalId: payload.MerchantTradeNo,
    amount: payload.TradeAmt,
    currency: 'TWD',
    payer: payload.CustomField1,
    message: payload.CustomField2,
    providerRecordId
  });
}
