import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountExport } from '../lib/privacy-export.js';

test('account export includes only allowlisted account and workspace data', () => {
  const exported = buildAccountExport({
    account: { id: 'user-1', email: 'creator@example.test', username: 'creator', displayName: 'Creator', passwordHash: 'must-not-export', oauthProviderId: 'oauth-secret' },
    subscription: { planType: 'pro', status: 'active', pricePerMonth: 70, currency: 'TWD', ecpayMerchantTradeNo: 'payment-reference' },
    workspaces: [{
      workspace: { id: 'workspace-1', workspaceName: 'Creator stream', slug: 'creator', donationUrl: '/donate/creator', webhookUrl: '/webhook/creator' },
      settings: { goalTitle: 'Camera', goalAmount: 1000, overlaySettings: { color: 'green' }, workspaceId: 'workspace-1' },
      provider: { merchantId: 'merchant-secret', hashKey: 'key-secret', hashIV: 'iv-secret' },
      donations: [{ id: 'donation-1', amount: 100, currency: 'TWD', payerName: 'Viewer', message: 'Good luck', status: 'completed', tradeNo: 'provider-reference', paymentProviderId: 'provider-1' }]
    }]
  });

  assert.equal(exported.format, 'donationbar.account-export.v1');
  assert.deepEqual(exported.account, { id: 'user-1', email: 'creator@example.test', username: 'creator', displayName: 'Creator' });
  assert.deepEqual(exported.subscription, { planType: 'pro', status: 'active', pricePerMonth: 70, currency: 'TWD' });
  assert.deepEqual(exported.workspaces[0].paymentProvider, { ecpayConfigured: true });
  assert.deepEqual(exported.workspaces[0].donations, [{ id: 'donation-1', amount: 100, currency: 'TWD', payerName: 'Viewer', message: 'Good luck', status: 'completed' }]);
  assert.equal(JSON.stringify(exported).includes('secret'), false);
  assert.equal(JSON.stringify(exported).includes('provider-reference'), false);
});
