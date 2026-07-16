import crypto from 'node:crypto';

const MAX_ECPAY_TRADE_NO_LENGTH = 20;

// ECPay merchant trade numbers are limited to 20 alphanumeric characters. A
// timestamp alone can collide when two viewers submit in the same millisecond;
// append 40 bits of entropy while keeping the identifier provider-compatible.
export function createProviderTradeNo(prefix, now = Date.now(), randomBytes = crypto.randomBytes) {
  if (!/^[A-Z0-9]+$/.test(prefix)) throw new Error('Trade-number prefix must be alphanumeric uppercase');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Trade-number timestamp must be a non-negative safe integer');
  const timestamp = now.toString(36).toUpperCase();
  const entropyBytes = Math.floor((MAX_ECPAY_TRADE_NO_LENGTH - prefix.length - timestamp.length) / 2);
  if (entropyBytes < 4) throw new Error('Trade-number prefix leaves insufficient entropy');
  const entropy = Buffer.from(randomBytes(entropyBytes)).toString('hex').toUpperCase();
  const tradeNo = `${prefix}${timestamp}${entropy}`;
  if (tradeNo.length > MAX_ECPAY_TRADE_NO_LENGTH || !/^[A-Z0-9]+$/.test(tradeNo)) {
    throw new Error('Generated trade number is incompatible with provider constraints');
  }
  return tradeNo;
}

export function createDonationTradeNo(now = Date.now(), randomBytes = crypto.randomBytes) {
  return createProviderTradeNo('D', now, randomBytes);
}

export function createSubscriptionTradeNo(now = Date.now(), randomBytes = crypto.randomBytes) {
  return createProviderTradeNo('SUB', now, randomBytes);
}
