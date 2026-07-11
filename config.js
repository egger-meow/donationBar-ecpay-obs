import { getCredentialEncryptionKey } from './credentials.js';

const PLACEHOLDER_SECRETS = new Set(['super-secret', 'your-super-secret-session-key-change-me']);
const DEFAULT_TRIAL_DAYS = 30;
const DEFAULT_MONTHLY_PRICE = 70;

function positiveIntegerSetting(value, fallback, name, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be a whole number`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return parsed;
}

// The only sellable plan today is an invited closed-beta plan. Keep its price in one
// place so checkout, callback validation, and public copy cannot drift apart.
export function getSubscriptionPlan(env = process.env) {
  return {
    currency: 'TWD',
    monthlyPrice: positiveIntegerSetting(env.SUBSCRIPTION_MONTHLY_PRICE, DEFAULT_MONTHLY_PRICE, 'SUBSCRIPTION_MONTHLY_PRICE', 100000),
    trialDays: positiveIntegerSetting(env.SUBSCRIPTION_TRIAL_DAYS, DEFAULT_TRIAL_DAYS, 'SUBSCRIPTION_TRIAL_DAYS', 90),
    phase: 'closed_beta'
  };
}

export function isProduction(env = process.env) {
  return env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production';
}

export function validateProductionConfig(env = process.env) {
  if (!isProduction(env)) return;
  const errors = [];
  if (!env.DATABASE_URL) errors.push('DATABASE_URL is required');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || PLACEHOLDER_SECRETS.has(env.SESSION_SECRET)) errors.push('SESSION_SECRET must be a non-placeholder value of at least 32 characters');
  if (!env.BASE_URL || !env.BASE_URL.startsWith('https://')) errors.push('BASE_URL must use HTTPS');
  try {
    getCredentialEncryptionKey(env);
  } catch (error) {
    errors.push(error.message);
  }
  for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BILLING_ECPAY_MERCHANT_ID', 'BILLING_ECPAY_HASH_KEY', 'BILLING_ECPAY_HASH_IV']) {
    if (!env[name] || env[name].startsWith('your-')) errors.push(`${name} is required`);
  }
  if (!platformAdminEmails(env).length) errors.push('PLATFORM_ADMIN_EMAILS must contain at least one administrator email');
  if (!['stage', 'production'].includes(env.ECPAY_ENVIRONMENT)) errors.push('ECPAY_ENVIRONMENT must be stage or production');
  if (env.ALERT_WEBHOOK_URL && !env.ALERT_WEBHOOK_URL.startsWith('https://')) errors.push('ALERT_WEBHOOK_URL must use HTTPS when set');
  try {
    getSubscriptionPlan(env);
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length) throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
}

export function platformAdminEmails(env = process.env) {
  return String(env.PLATFORM_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformAdminEmail(email, env = process.env) {
  return platformAdminEmails(env).includes(String(email || '').trim().toLowerCase());
}

export function getBillingECPayCredentials(env = process.env) {
  return { merchantId: env.BILLING_ECPAY_MERCHANT_ID || '', hashKey: env.BILLING_ECPAY_HASH_KEY || '', hashIV: env.BILLING_ECPAY_HASH_IV || '' };
}

export function getECPayCheckoutUrl(env = process.env) {
  return env.ECPAY_ENVIRONMENT === 'production' ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5' : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
}

export function getECPayPeriodActionUrl(env = process.env) {
  return env.ECPAY_ENVIRONMENT === 'production' ? 'https://payment.ecpay.com.tw/Cashier/CreditCardPeriodAction' : 'https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction';
}
