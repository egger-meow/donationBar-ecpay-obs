import { normalizeDonationEvent } from '../donation-event.js';

// Translate only after the caller has verified the ECPay signature and decrypted Data.
// No ECPay-shaped object leaves this module.
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
