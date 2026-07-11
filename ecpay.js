import crypto from 'crypto';

export function ecpayUrlEncode(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, '+').replace(/%2D/gi, '-').replace(/%5F/gi, '_').replace(/%2E/gi, '.')
    .replace(/%21/gi, '!').replace(/%2A/gi, '*').replace(/%28/gi, '(').replace(/%29/gi, ')')
    .toLowerCase();
}

export function generateCheckMacValueForCredentials(params, credentials) {
  const sorted = Object.keys(params).filter(key => key !== 'CheckMacValue').sort((a, b) => a.localeCompare(b)).map(key => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha256').update(ecpayUrlEncode(`HashKey=${credentials.hashKey}&${sorted}&HashIV=${credentials.hashIV}`)).digest('hex').toUpperCase();
}

export function verifyCheckMacValueForCredentials(params, credentials) {
  if (!params?.CheckMacValue) return false;
  const expected = generateCheckMacValueForCredentials(params, credentials);
  const received = String(params.CheckMacValue).toUpperCase();
  return expected.length === received.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
