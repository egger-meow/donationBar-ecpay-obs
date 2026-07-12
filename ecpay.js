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

// Parse the exact URL-encoded bytes captured by body-parser before it normalizes the
// request. Duplicate keys are rejected because they make signature meaning ambiguous.
export function parseUnmodifiedFormBody(rawBody) {
  if (!rawBody) return null;
  const form = new URLSearchParams(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  const params = {};
  for (const [key, value] of form.entries()) {
    if (Object.prototype.hasOwnProperty.call(params, key)) return null;
    params[key] = value;
  }
  return params;
}

export function verifyCheckMacValueForRawBody(rawBody, credentials) {
  const params = parseUnmodifiedFormBody(rawBody);
  return params ? verifyCheckMacValueForCredentials(params, credentials) : false;
}
