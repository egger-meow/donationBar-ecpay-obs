import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SSE admin notifications require an authenticated workspace-owner client', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /canReceiveAdminNotifications:\s*req\.session\?\.userId\s*===\s*workspace\.userId/);
  assert.match(source, /client\.workspaceId\s*===\s*workspaceId\s*&&\s*client\.canReceiveAdminNotifications/);
});

test('unpaid webhook notification never broadcasts the provider trade number', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const unpaidBlock = source.slice(source.indexOf("'payment_webhook_not_paid'"), source.indexOf('const donationEvent = normalizeEcpayPaidDonation', source.indexOf("'payment_webhook_not_paid'")));
  assert.ok(unpaidBlock.length > 0, 'expected unpaid webhook branch');
  assert.doesNotMatch(unpaidBlock, /tradeNo|MerchantTradeNo/);
});
