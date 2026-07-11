import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, requireStagingBaseUrl, runPreflight } from '../operations/staging-preflight.js';

function stubFetch(handler) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  return { calls, restore: () => { global.fetch = originalFetch; } };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('parseArgs reads --base-url and --check-alert-webhook', () => {
  assert.deepEqual(parseArgs(['--base-url', 'https://staging.example.com', '--check-alert-webhook']), {
    baseUrl: 'https://staging.example.com',
    checkAlertWebhook: true
  });
  assert.deepEqual(parseArgs(['--base-url=https://staging.example.com']), {
    baseUrl: 'https://staging.example.com',
    checkAlertWebhook: false
  });
});

test('requireStagingBaseUrl rejects a missing base URL', () => {
  assert.throws(() => requireStagingBaseUrl({ env: {} }), /staging base URL is required/i);
});

test('requireStagingBaseUrl rejects a malformed URL', () => {
  assert.throws(() => requireStagingBaseUrl({ argBaseUrl: 'not-a-url', env: {} }), /not a valid absolute URL/i);
});

test('requireStagingBaseUrl rejects non-HTTPS outside sandbox', () => {
  assert.throws(
    () => requireStagingBaseUrl({ argBaseUrl: 'http://staging.example.com', env: {} }),
    /must use HTTPS outside sandbox/i
  );
});

test('requireStagingBaseUrl allows HTTPS regardless of environment', () => {
  const parsed = requireStagingBaseUrl({ argBaseUrl: 'https://staging.example.com', env: {} });
  assert.equal(parsed.protocol, 'https:');
});

test('requireStagingBaseUrl allows HTTP only when ENVIRONMENT=sandbox', () => {
  const parsed = requireStagingBaseUrl({ argBaseUrl: 'http://localhost:3000', env: { ENVIRONMENT: 'sandbox' } });
  assert.equal(parsed.protocol, 'http:');
});

test('runPreflight queries only /health/live and /health/ready by default, redacts base URL and ready body', async () => {
  const stub = stubFetch(url => {
    if (url.endsWith('/health/live')) return jsonResponse(200, { status: 'ok' });
    if (url.endsWith('/health/ready')) return jsonResponse(200, { status: 'ready', database: 'postgresql', connectionString: 'postgres://user:pass@host/db' });
    throw new Error(`unexpected fetch to ${url}`);
  });
  try {
    const result = await runPreflight({
      argv: ['--base-url', 'https://staging.example.com/?token=secret#frag'],
      env: {}
    });

    assert.equal(stub.calls.length, 2);
    assert.deepEqual(stub.calls.map(c => c.url).sort(), [
      'https://staging.example.com/health/live',
      'https://staging.example.com/health/ready'
    ]);

    assert.equal(result.pass, true);
    assert.equal(result.baseUrl, 'https://staging.example.com');
    assert.equal(result.checks.live.ok, true);
    assert.equal(result.checks.ready.ok, true);
    assert.equal(result.checks.ready.status, 'ready');
    assert.equal(result.checks.ready.database, 'postgresql');
    assert.equal('connectionString' in result.checks.ready, false);
    assert.equal(result.alertWebhook, null);
  } finally {
    stub.restore();
  }
});

test('runPreflight fails when readiness reports not_ready', async () => {
  const stub = stubFetch(url => {
    if (url.endsWith('/health/live')) return jsonResponse(200, { status: 'ok' });
    if (url.endsWith('/health/ready')) return jsonResponse(503, { status: 'not_ready', database: 'postgresql' });
    throw new Error(`unexpected fetch to ${url}`);
  });
  try {
    const result = await runPreflight({ argv: ['--base-url', 'https://staging.example.com'], env: {} });
    assert.equal(result.pass, false);
    assert.equal(result.checks.ready.ok, false);
    assert.equal(result.checks.ready.statusCode, 503);
  } finally {
    stub.restore();
  }
});

test('runPreflight never contacts the alert webhook unless explicitly enabled', async () => {
  const stub = stubFetch(url => {
    if (url.endsWith('/health/live')) return jsonResponse(200, { status: 'ok' });
    if (url.endsWith('/health/ready')) return jsonResponse(200, { status: 'ready', database: 'postgresql' });
    throw new Error(`unexpected fetch to ${url}`);
  });
  try {
    const result = await runPreflight({
      argv: ['--base-url', 'https://staging.example.com'],
      env: { ALERT_WEBHOOK_URL: 'https://alerts.example/hook/secret-token' }
    });
    assert.equal(stub.calls.length, 2);
    assert.equal(result.alertWebhook, null);
  } finally {
    stub.restore();
  }
});

test('runPreflight checks the alert webhook with a fixed synthetic event when enabled, and never returns the webhook URL', async () => {
  const stub = stubFetch(url => {
    if (url.endsWith('/health/live')) return jsonResponse(200, { status: 'ok' });
    if (url.endsWith('/health/ready')) return jsonResponse(200, { status: 'ready', database: 'postgresql' });
    if (url === 'https://alerts.example/hook/secret-token') return jsonResponse(200, {});
    throw new Error(`unexpected fetch to ${url}`);
  });
  try {
    const result = await runPreflight({
      argv: ['--base-url', 'https://staging.example.com', '--check-alert-webhook'],
      env: { ALERT_WEBHOOK_URL: 'https://alerts.example/hook/secret-token' }
    });

    assert.equal(stub.calls.length, 3);
    const alertCall = stub.calls.find(c => c.url === 'https://alerts.example/hook/secret-token');
    assert.ok(alertCall);
    assert.equal(alertCall.init.method, 'POST');
    const body = JSON.parse(alertCall.init.body);
    assert.deepEqual(Object.keys(body).sort(), ['event', 'timestamp']);
    assert.equal(body.event, 'staging_preflight_check');

    assert.equal(result.pass, true);
    assert.equal(result.alertWebhook.skipped, false);
    assert.equal(result.alertWebhook.ok, true);
    assert.equal(JSON.stringify(result).includes('secret-token'), false);
  } finally {
    stub.restore();
  }
});

test('runPreflight skips the alert webhook check with a reason when unconfigured, even if explicitly enabled', async () => {
  const stub = stubFetch(url => {
    if (url.endsWith('/health/live')) return jsonResponse(200, { status: 'ok' });
    if (url.endsWith('/health/ready')) return jsonResponse(200, { status: 'ready', database: 'postgresql' });
    throw new Error(`unexpected fetch to ${url}`);
  });
  try {
    const result = await runPreflight({
      argv: ['--base-url', 'https://staging.example.com', '--check-alert-webhook'],
      env: {}
    });
    assert.equal(stub.calls.length, 2);
    assert.equal(result.alertWebhook.skipped, true);
    assert.match(result.alertWebhook.reason, /not configured/i);
    assert.equal(result.pass, true);
  } finally {
    stub.restore();
  }
});
