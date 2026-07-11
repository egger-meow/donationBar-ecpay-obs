import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { requestObservability, routeLabel } from '../observability.js';

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
