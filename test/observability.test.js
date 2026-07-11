import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestObservability, routeLabel, sendAlert } from '../observability.js';

function stubFetch(handler) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler ? handler(url, init) : { ok: true };
  };
  return { calls, restore: () => { global.fetch = originalFetch; } };
}

test('route labels never include workspace slugs or query data', () => {
  assert.equal(routeLabel({ path: '/webhook/creator-private' }), '/webhook/:slug');
  assert.equal(routeLabel({ path: '/api/workspaces/private-id' }), '/api/*');
  assert.equal(routeLabel({ path: '/health/ready' }), '/health/ready');
});

test('request observability creates a server request ID and response header', () => {
  const req = { method: 'POST', path: '/webhook/creator-private' };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => { res.headers[name] = value; };
  let called = false;
  requestObservability(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.match(req.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers['X-Request-Id'], req.requestId);
});

test('sendAlert does nothing when no webhook URL is configured', async () => {
  const stub = stubFetch();
  try {
    await sendAlert('readiness_check_failed', { requestId: 'req-1', route: '/health/ready', statusCode: 503 }, {});
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('sendAlert ignores event names outside the fixed vocabulary', async () => {
  const stub = stubFetch();
  try {
    await sendAlert('donor_leaderboard_updated', { requestId: 'req-1' }, { ALERT_WEBHOOK_URL: 'https://alerts.example/hook' });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('sendAlert posts a redacted, allowlisted payload for a known event', async () => {
  const stub = stubFetch();
  try {
    await sendAlert('payment_webhook_decryption_failed', {
      requestId: 'req-42',
      route: '/webhook/:slug',
      statusCode: 400,
      payerName: 'should-never-be-forwarded',
      hashKey: 'should-never-be-forwarded'
    }, { ALERT_WEBHOOK_URL: 'https://alerts.example/hook' });

    assert.equal(stub.calls.length, 1);
    const { url, init } = stub.calls[0];
    assert.equal(url, 'https://alerts.example/hook');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.ok(init.signal instanceof AbortSignal);

    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(), ['event', 'request_id', 'route', 'status_code', 'timestamp']);
    assert.equal(body.event, 'payment_webhook_decryption_failed');
    assert.equal(body.request_id, 'req-42');
    assert.equal(body.route, '/webhook/:slug');
    assert.equal(body.status_code, 400);
  } finally {
    stub.restore();
  }
});

test('sendAlert never throws when delivery fails', async () => {
  const stub = stubFetch(() => { throw new Error('network unreachable'); });
  try {
    await assert.doesNotReject(sendAlert('http_unhandled_error', { requestId: 'req-1', route: '/other', statusCode: 500 }, { ALERT_WEBHOOK_URL: 'https://alerts.example/hook' }));
  } finally {
    stub.restore();
  }
});
