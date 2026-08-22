import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser-initiated state-changing routes require same-origin protection', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const providerOrNavigationRoutes = new Set([
    '/success',
    '/webhook/:slug',
    '/api/webhook/generic/:slug',
    '/subscription/success',
    '/ecpay/return',
    '/ecpay/period/callback'
  ]);
  const missing = [];
  const routePattern = /app\.(post|put|patch|delete)\('([^']+)'([^\n]*)/g;
  for (const match of source.matchAll(routePattern)) {
    const [, method, route, declarationTail] = match;
    if (providerOrNavigationRoutes.has(route)) continue;
    if (!declarationTail.includes('requireSameOrigin')) missing.push(`${method.toUpperCase()} ${route}`);
  }
  assert.deepEqual(missing, [], `browser mutations missing same-origin middleware: ${missing.join(', ')}`);
});
