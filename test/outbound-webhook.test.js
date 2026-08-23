import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import database from '../lib/database.js';
import {
  validateOutboundWebhookUrl,
  sendMilestoneWebhook,
  dispatchMilestoneWebhookAction
} from '../lib/goal-engine/outbound-webhook.js';

test('validateOutboundWebhookUrl: accepts valid public HTTPS URLs', () => {
  const result = validateOutboundWebhookUrl('https://api.streamerbot.com/webhook/123');
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);

  const discordResult = validateOutboundWebhookUrl('https://discord.com/api/webhooks/12345/abcdef');
  assert.equal(discordResult.valid, true);
});

test('validateOutboundWebhookUrl: rejects SSRF attempts with private IPs and metadata services', () => {
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

    // Decimal IP representation of 127.0.0.1
    const decimalIp = validateOutboundWebhookUrl('https://2130706433/hook');
    assert.equal(decimalIp.valid, false);

    // Metadata hostnames
    const gcpMeta = validateOutboundWebhookUrl('https://metadata.google.internal/computeMetadata/v1/');
    assert.equal(gcpMeta.valid, false);

    const azureMeta = validateOutboundWebhookUrl('https://metadata.azure.internal/metadata/instance');
    assert.equal(azureMeta.valid, false);

    // Internal TLDs
    const internalTld = validateOutboundWebhookUrl('https://my-service.internal/webhook');
    assert.equal(internalTld.valid, false);

    const localTld = validateOutboundWebhookUrl('https://my-service.local/webhook');
    assert.equal(localTld.valid, false);

    // IPv6 private & loopback
    const ipv6Loopback = validateOutboundWebhookUrl('https://[::1]/webhook');
    assert.equal(ipv6Loopback.valid, false);

    const ipv6UniqueLocal = validateOutboundWebhookUrl('https://[fc00::1]/webhook');
    assert.equal(ipv6UniqueLocal.valid, false);

    const ipv6LinkLocal = validateOutboundWebhookUrl('https://[fe80::1]/webhook');
    assert.equal(ipv6LinkLocal.valid, false);

    const ipv6Mapped = validateOutboundWebhookUrl('https://[::ffff:127.0.0.1]/webhook');
    assert.equal(ipv6Mapped.valid, false);
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

test('dispatchMilestoneWebhookAction: records delivery status pending then failed/delivered with retries', async () => {
  const workspaceId = uuidv4();
  const goalId = uuidv4();
  const triggerId = uuidv4();

  // Non-existent target fails with retries and persists failure in DB
  const promise = dispatchMilestoneWebhookAction({
    database,
    workspaceId,
    goalId,
    triggerId,
    url: 'https://non-existent-domain-123456789.invalid/webhook',
    payload: { event: 'goal.milestone_reached' },
    maxRetries: 1,
    retryBackoffMs: 50
  });

  const result = await promise;
  assert.equal(result.delivered, false);

  const deliveries = await database.getGoalActionDeliveries(goalId);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].status, 'failed');
  assert.equal(deliveries[0].targetUrl, 'https://non-existent-domain-123456789.invalid/webhook');
  assert.ok(deliveries[0].errorMessage);
});

test('dispatchMilestoneWebhookAction: supports executionCtx.waitUntil without unhandled rejection', async () => {
  const workspaceId = uuidv4();
  const goalId = uuidv4();
  const triggerId = uuidv4();

  let waitedPromise = null;
  const mockExecutionCtx = {
    waitUntil: (p) => {
      waitedPromise = p;
    }
  };

  dispatchMilestoneWebhookAction({
    database,
    workspaceId,
    goalId,
    triggerId,
    url: 'https://127.0.0.1/blocked-ssrf',
    payload: { event: 'goal.milestone_reached' },
    executionCtx: mockExecutionCtx
  });

  assert.ok(waitedPromise);
  const res = await waitedPromise;
  assert.equal(res.delivered, false);
  assert.ok(res.error.includes('SSRF validation failed'));
});

test('sendMilestoneWebhook: rejects redirect-to-private-address attacks', async () => {
  // Test with a local HTTP server that responds with 302 Location: https://169.254.169.254/latest/meta-data
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    res.writeHead(302, { Location: 'https://169.254.169.254/latest/meta-data' });
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const prevEnv = process.env.ENVIRONMENT;
  process.env.ENVIRONMENT = 'sandbox'; // permit local initial URL for test fixture

  try {
    const result = await sendMilestoneWebhook({
      url: `http://127.0.0.1:${port}/redirect-attack`,
      payload: { event: 'goal.milestone_reached' }
    });

    assert.equal(result.delivered, false);
    assert.ok(result.error.includes('SSRF validation failed on redirect target'));
  } finally {
    process.env.ENVIRONMENT = prevEnv;
    server.close();
  }
});


