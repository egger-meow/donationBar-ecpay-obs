import test from 'node:test';
import assert from 'node:assert/strict';
import { getECPayCheckoutUrl, getECPayPeriodActionUrl, isPlatformAdminEmail, platformAdminEmails, validateProductionConfig } from '../config.js';

const validProduction = { NODE_ENV: 'production', DATABASE_URL: 'postgres://example/db', SESSION_SECRET: 'a'.repeat(32), CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'), BASE_URL: 'https://donationbar.example', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', BILLING_ECPAY_MERCHANT_ID: 'merchant', BILLING_ECPAY_HASH_KEY: 'key', BILLING_ECPAY_HASH_IV: 'iv', PLATFORM_ADMIN_EMAILS: 'owner@example.com', ECPAY_ENVIRONMENT: 'production' };

test('production rejects unsafe defaults and missing billing credentials', () => {
  assert.throws(() => validateProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'super-secret' }), /DATABASE_URL.*SESSION_SECRET.*BASE_URL.*BILLING_ECPAY/s);
});

test('production rejects an invalid credential-encryption key', () => {
  assert.throws(() => validateProductionConfig({ ...validProduction, CREDENTIAL_ENCRYPTION_KEY: 'not-a-32-byte-key' }), /CREDENTIAL_ENCRYPTION_KEY/);
});

test('valid production config selects live ECPay', () => {
  assert.doesNotThrow(() => validateProductionConfig(validProduction));
  assert.equal(getECPayCheckoutUrl(validProduction), 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5');
  assert.equal(getECPayPeriodActionUrl(validProduction), 'https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction');
});

test('ECPay stage selection is independent from application production mode', () => assert.equal(getECPayCheckoutUrl({ NODE_ENV: 'production', ECPAY_ENVIRONMENT: 'stage' }), 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'));

test('platform administrators are explicit and case-normalized', () => {
  const env = { PLATFORM_ADMIN_EMAILS: ' Owner@Example.com, ops@example.com ' };
  assert.deepEqual(platformAdminEmails(env), ['owner@example.com', 'ops@example.com']);
  assert.equal(isPlatformAdminEmail('OWNER@example.com', env), true);
  assert.equal(isPlatformAdminEmail('streamer@example.com', env), false);
});
