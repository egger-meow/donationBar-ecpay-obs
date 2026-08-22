import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isProviderCallbackPath } from '../lib/rate-limit-policy.js';

test('generic webhook route is registered with token verification and rate limiting', async () => {
  const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const handlerSource = await readFile(new URL('../lib/generic-webhook-handler.js', import.meta.url), 'utf8');

  // Verify route registration
  assert.match(serverSource, /app\.post\('\/api\/webhook\/generic\/:slug',\s*async \(req, res\)/);

  // Verify rate limiter attachment
  assert.match(serverSource, /app\.use\('\/api\/webhook\/generic',\s*providerCallbackRateLimiter\)/);
  assert.equal(isProviderCallbackPath('/api/webhook/generic/my-slug'), true);

  // Verify timing-safe token check in handler
  assert.match(handlerSource, /crypto\.timingSafeEqual/);
  assert.match(handlerSource, /generic_webhook_invalid_token/);

  // Verify idempotency and response codes in handler
  assert.match(handlerSource, /statusCode:\s*200[\s\S]*duplicate:\s*true/);
  assert.match(handlerSource, /statusCode:\s*201[\s\S]*duplicate:\s*false/);
});

test('creator event APIs are protected with admin authentication and same-origin checks', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(source, /app\.post\('\/api\/events\/manual',\s*requireAdmin,\s*requireSameOrigin/);
  assert.match(source, /app\.post\('\/api\/events\/test',\s*requireAdmin,\s*requireSameOrigin/);
  assert.match(source, /app\.get\('\/api\/events',\s*requireAdmin/);
  assert.match(source, /app\.get\('\/api\/workspace\/webhook-token',\s*requireAdmin/);
  assert.match(source, /app\.post\('\/api\/workspace\/webhook-token\/rotate',\s*requireAdmin,\s*requireSameOrigin/);
});

test('ECPay payment handlers wrap success into canonical revenue events', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(source, /normalizeEcpayPaidRevenueEvent/);
  assert.match(source, /normalizeEcpayReturnRevenueEvent/);
  assert.match(source, /database\.addRevenueEvent/);
});
