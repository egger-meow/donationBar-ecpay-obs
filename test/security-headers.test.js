import test from 'node:test';
import assert from 'node:assert/strict';
import { getHelmetOptions } from '../lib/security-headers.js';

test('CSP confines browser resources while allowing existing inline pages and ECPay checkout', () => {
  const directives = getHelmetOptions({ production: true }).contentSecurityPolicy.directives;
  assert.deepEqual(directives.defaultSrc, ["'self'"]);
  assert.deepEqual(directives.objectSrc, ["'none'"]);
  assert.deepEqual(directives.frameAncestors, ["'self'"]);
  assert.ok(directives.formAction.includes('https://payment.ecpay.com.tw'));
  assert.ok(directives.formAction.includes('https://payment-stage.ecpay.com.tw'));
  assert.ok(directives.scriptSrc.includes("'unsafe-inline'"), 'legacy inline scripts require this until nonce migration');
  assert.deepEqual(directives.upgradeInsecureRequests, []);
});

test('local/sandbox CSP does not upgrade localhost HTTP', () => {
  assert.equal(getHelmetOptions({ production: false }).contentSecurityPolicy.directives.upgradeInsecureRequests, null);
});
