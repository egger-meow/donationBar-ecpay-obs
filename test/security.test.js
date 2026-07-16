import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedRequestOrigin, isSameOriginRequest, requestOrigin } from '../lib/security.js';

function request(headers = {}, protocol = 'https') {
  return { protocol, get(name) { return headers[name.toLowerCase()]; } };
}

test('accepts the configured same origin', () => {
  assert.equal(isSameOriginRequest(request({ origin: 'https://app.donationbar.example' }), 'https://app.donationbar.example'), true);
});

test('rejects cross-site and missing origin evidence', () => {
  assert.equal(isSameOriginRequest(request({ origin: 'https://attacker.example' }), 'https://app.donationbar.example'), false);
  assert.equal(isSameOriginRequest(request({}), 'https://app.donationbar.example'), false);
});

test('accepts a same-origin referer and ignores its path', () => {
  const req = request({ referer: 'https://app.donationbar.example/admin?tab=billing' });
  assert.equal(requestOrigin(req), 'https://app.donationbar.example');
  assert.equal(expectedRequestOrigin(req, 'https://app.donationbar.example/base'), 'https://app.donationbar.example');
});
