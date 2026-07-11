import { verifyCheckMacValueForCredentials } from './ecpay.js';

function nextMonthlyBillingDate(from = new Date()) {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function processSubscriptionPaymentCallback(payload, { credentials, database, monthlyPrice }) {
  if (String(payload?.MerchantID) !== String(credentials.merchantId)) return { ok: false, status: 400, message: '0|Invalid merchant' };
  if (!verifyCheckMacValueForCredentials(payload, credentials)) return { ok: false, status: 400, message: '0|Invalid checksum' };
  if (String(payload.SimulatePaid || '0') === '1') return { ok: true, simulated: true };

  const userId = String(payload.CustomField1 || '').trim();
  const tradeNo = String(payload.TradeNo || '').trim();
  const merchantTradeNo = String(payload.MerchantTradeNo || '').trim();
  const amountText = String(payload.PeriodAmount || payload.TradeAmt || '').trim();
  const amount = /^\d{1,9}$/.test(amountText) ? Number(amountText) : NaN;
  if (!userId || !/^[a-zA-Z0-9_-]{1,50}$/.test(tradeNo) || !/^[a-zA-Z0-9_-]{1,50}$/.test(merchantTradeNo) || !Number.isSafeInteger(amount)) {
    return { ok: false, status: 400, message: '0|Invalid payment data' };
  }

  const subscription = await database.getUserSubscription(userId);
  if (!subscription || (subscription.ecpayMerchantTradeNo && subscription.ecpayMerchantTradeNo !== merchantTradeNo)) return { ok: false, status: 404, message: '0|Subscription not found' };
  const expectedAmount = Number.parseInt(subscription.pricePerMonth || monthlyPrice || '70', 10);
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 1 || amount !== expectedAmount) return { ok: false, status: 400, message: '0|Invalid payment amount' };

  const success = String(payload.RtnCode) === '1';
  const payment = await database.createPaymentRecord({
    subscriptionId: subscription.id, userId, amount, currency: 'TWD', status: success ? 'success' : 'failed',
    ecpayTradeNo: tradeNo, ecpayMerchantTradeNo: merchantTradeNo, ecpayPaymentDate: payload.PaymentDate || null,
    paymentMethod: payload.PaymentType || 'Credit', paymentMethodType: payload.PaymentType || 'Credit',
    cardAuthCode: payload.AuthCode || null, cardFirst6: payload.card6no || payload.Card6No || null,
    cardLast4: payload.card4no || payload.Card4No || null, periodType: payload.PeriodType || 'M',
    frequency: Number.parseInt(payload.Frequency || '1', 10), execTimes: Number.parseInt(payload.ExecTimes || '0', 10) || null,
    totalSuccessTimes: Number.parseInt(payload.TotalSuccessTimes || '0', 10), totalSuccessAmount: Number.parseInt(payload.TotalSuccessAmount || '0', 10),
    errorMessage: success ? null : String(payload.RtnMsg || 'Payment failed')
  });
  if (!payment) throw new Error('Payment could not be persisted');
  if (payment.wasDuplicate) return { ok: true, success, duplicate: true };

  if (success) {
    const paidAt = payload.PaymentDate ? new Date(payload.PaymentDate.replace(/\//g, '-')) : new Date();
    const billingStart = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt;
    await database.updateSubscription(userId, {
      planType: 'pro', status: 'active', isTrial: false, pricePerMonth: expectedAmount,
      ecpayMerchantTradeNo: merchantTradeNo, ecpayTradeNo: tradeNo, lastPaymentDate: billingStart,
      lastPaymentStatus: 'success', failedPaymentCount: 0, lastFailedAt: null, gracePeriodEndAt: null,
      nextBillingDate: nextMonthlyBillingDate(billingStart).toISOString()
    });
  } else {
    await database.updateSubscription(userId, { lastPaymentStatus: 'failed', failedPaymentCount: (subscription.failedPaymentCount || 0) + 1, lastFailedAt: new Date() });
  }
  return { ok: true, success };
}
