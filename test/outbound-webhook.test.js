import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOutboundWebhookUrl, sendMilestoneWebhook } from '../lib/goal-engine/outbound-webhook.js';

test('validateOutboundWebhookUrl: accepts valid public HTTPS URLs', () => {
  const result = validateOutboundWebhookUrl('https://api.streamerbot.com/webhook/123');
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);

  const discordResult = validateOutboundWebhookUrl('https://discord.com/api/webhooks/12345/abcdef');
  assert.equal(discordResult.valid, true);
});

test('validateOutboundWebhookUrl: rejects SSRF attempts with private IPs and metadata services', () => {
  // Cloud metadata IP
  const metadata = validateOutboundWebhookUrl('https://169.254.169.254/latest/meta-data', { allowHttpInSandbox: false });
  // In non-sandbox mode:
  const prevEnv = process.env.ENVIRONMENT;
  process.env.ENVIRONMENT = 'production';
  try {
    const metaCheck = validateOutboundWebhookUrl('https://169.254.169.254/latest/meta-data');
    assert.equal(metaCheck.valid, false);

    const loopback = validateOutboundWebhookUrl('https://127.0.0.1:8080/hook');
    assert.equal(loopback.valid, false);

    const priv10 = validateOutboundWebhookUrl('https://10.0.0.5/hook');
    assert.equal(priv10.valid, false);

    const priv192 = validateOutboundWebhookUrl('https://192.168.1.100/hook');
    assert.equal(priv192.valid, false);

    const priv172 = validateOutboundWebhookUrl('https://172.20.0.1/hook');
    assert.equal(priv172.valid, false);

    const localhostCheck = validateOutboundWebhookUrl('https://localhost:3000/hook');
    assert.equal(localhostCheck.valid, false);
  } finally {
    process.env.ENVIRONMENT = prevEnv;
  }
});

test('validateOutboundWebhookUrl: rejects unsafe schemes and credentials', () => {
  const prevEnv = process.env.ENVIRONMENT;
  process.env.ENVIRONMENT = 'production';
  try {
    const httpCheck = validateOutboundWebhookUrl('http://example.com/webhook');
    assert.equal(httpCheck.valid, false);
    assert.equal(httpCheck.reason, 'non_https_protocol');

    const creds = validateOutboundWebhookUrl('https://admin:password@example.com/webhook');
    assert.equal(creds.valid, false);
    assert.equal(creds.reason, 'embedded_credentials_forbidden');

    const js = validateOutboundWebhookUrl('javascript:alert(1)');
    assert.equal(js.valid, false);
  } finally {
    process.env.ENVIRONMENT = prevEnv;
  }
});

test('sendMilestoneWebhook: fails gracefully on network errors without throwing', async () => {
  const result = await sendMilestoneWebhook({
    url: 'https://non-existent-domain-123456789.invalid/webhook',
    payload: { event: 'goal.milestone_reached' },
    timeoutMs: 500
  });

  assert.equal(result.delivered, false);
  assert.ok(result.error);
});
