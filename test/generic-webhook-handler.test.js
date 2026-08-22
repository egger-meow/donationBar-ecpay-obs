import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWebhookToken, processGenericWebhook, verifyWebhookToken } from '../lib/generic-webhook-handler.js';

function createMockDatabase({
  workspaces = {},
  tokens = {},
  events = []
} = {}) {
  return {
    async getWorkspaceBySlug(slug) {
      return workspaces[slug] || null;
    },
    async getGenericWebhookToken(workspaceId) {
      return tokens[workspaceId] || null;
    },
    async addRevenueEvent(workspaceId, event) {
      const isDup = events.some(
        e => e.workspaceId === workspaceId && e.source === event.source && e.externalEventId === event.externalEventId
      );
      if (isDup) {
        return { success: false, duplicate: true, event: { id: 'existing-id' } };
      }
      events.push({ ...event, workspaceId });
      return { success: true, duplicate: false, event };
    }
  };
}

test('verifyWebhookToken accurately checks timing-safe equality', () => {
  assert.equal(verifyWebhookToken('whsec_secret123', 'whsec_secret123'), true);
  assert.equal(verifyWebhookToken('whsec_secret123', 'whsec_wrong'), false);
  assert.equal(verifyWebhookToken('', 'whsec_secret123'), false);
  assert.equal(verifyWebhookToken(null, 'whsec_secret123'), false);
  assert.equal(verifyWebhookToken('whsec_secret123', null), false);
});

test('extractWebhookToken parses x-webhook-token and Bearer authorization header', () => {
  assert.equal(extractWebhookToken({ 'x-webhook-token': 'token-1' }), 'token-1');
  assert.equal(extractWebhookToken({ 'authorization': 'Bearer token-2' }), 'token-2');
  assert.equal(extractWebhookToken({ 'authorization': 'Basic credentials' }), null);
  assert.equal(extractWebhookToken({}), null);
});

test('processGenericWebhook rejects missing or non-existent workspace with 404', async () => {
  const db = createMockDatabase();
  const res1 = await processGenericWebhook({ slug: null, authToken: 't', body: {}, database: db });
  assert.equal(res1.statusCode, 404);

  const res2 = await processGenericWebhook({ slug: 'missing-ws', authToken: 't', body: {}, database: db });
  assert.equal(res2.statusCode, 404);
});

test('processGenericWebhook rejects missing or invalid authentication token with 401', async () => {
  const db = createMockDatabase({
    workspaces: { mycreator: { id: 'ws-1', slug: 'mycreator' } },
    tokens: { 'ws-1': 'whsec_correct_token' }
  });

  // Missing token
  const res1 = await processGenericWebhook({
    slug: 'mycreator',
    authToken: null,
    body: { eventId: '1', amount: 100, currency: 'USD' },
    database: db
  });
  assert.equal(res1.statusCode, 401);
  assert.match(res1.body.error, /Missing webhook authentication token/);

  // Wrong token
  const res2 = await processGenericWebhook({
    slug: 'mycreator',
    authToken: 'whsec_wrong_token',
    body: { eventId: '1', amount: 100, currency: 'USD' },
    database: db
  });
  assert.equal(res2.statusCode, 401);
  assert.match(res2.body.error, /Invalid webhook authentication token/);
});

test('processGenericWebhook rejects malformed body with 400', async () => {
  const db = createMockDatabase({
    workspaces: { mycreator: { id: 'ws-1', slug: 'mycreator' } },
    tokens: { 'ws-1': 'whsec_correct_token' }
  });

  // Missing eventId
  const res1 = await processGenericWebhook({
    slug: 'mycreator',
    authToken: 'whsec_correct_token',
    body: { amount: 100, currency: 'USD' },
    database: db
  });
  assert.equal(res1.statusCode, 400);
  assert.match(res1.body.error, /eventId/);

  // Invalid currency
  const res2 = await processGenericWebhook({
    slug: 'mycreator',
    authToken: 'whsec_correct_token',
    body: { eventId: 'evt-1', amount: 100, currency: 'FAKE_CURRENCY' },
    database: db
  });
  assert.equal(res2.statusCode, 400);
  assert.match(res2.body.error, /currency/);
});

test('processGenericWebhook processes valid payload and enforces idempotency', async () => {
  const db = createMockDatabase({
    workspaces: { mycreator: { id: 'ws-1', slug: 'mycreator' } },
    tokens: { 'ws-1': 'whsec_correct_token' }
  });

  const payload = {
    eventId: 'order-12345',
    type: 'donation',
    amount: 2500,
    currency: 'USD',
    supporter: 'GenerousViewer',
    message: 'Love the stream!'
  };

  // First submission -> 201 Created
  const res1 = await processGenericWebhook({
    slug: 'mycreator',
    authToken: 'whsec_correct_token',
    body: payload,
    database: db
  });

  assert.equal(res1.statusCode, 201);
  assert.equal(res1.body.status, 'success');
  assert.equal(res1.body.duplicate, false);
  assert.equal(res1.wasDuplicate, false);
  assert.ok(res1.body.eventId);

  // Second submission with exact same eventId -> 200 OK with duplicate: true
  const res2 = await processGenericWebhook({
    slug: 'mycreator',
    authToken: 'whsec_correct_token',
    body: payload,
    database: db
  });

  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.status, 'success');
  assert.equal(res2.body.duplicate, true);
  assert.equal(res2.wasDuplicate, true);
});
