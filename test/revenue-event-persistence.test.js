import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import database from '../lib/database.js';
import { createMonetaryRevenueEvent, createUnitRevenueEvent } from '../lib/revenue-event.js';
import { createManualRevenueEvent } from '../lib/source-adapters/manual-adapter.js';

const DB_PATH = path.join(path.resolve(), 'db.json');
let originalDbContent = null;

test.before(async () => {
  if (fs.existsSync(DB_PATH)) {
    originalDbContent = fs.readFileSync(DB_PATH, 'utf8');
  }
});

test.after(async () => {
  if (originalDbContent !== null) {
    fs.writeFileSync(DB_PATH, originalDbContent, 'utf8');
  }
});

test('persisting external revenue events enforces idempotency per workspace and source', async () => {
  const workspaceId = 'ws-test-persist-1';

  // First event
  const event1 = createMonetaryRevenueEvent({
    workspaceId,
    source: 'webhook',
    sourceEventType: 'donation',
    externalEventId: 'ext-unique-999',
    amountMinor: 2500,
    currency: 'USD',
    supporter: 'Donor1'
  });

  const res1 = await database.addRevenueEvent(workspaceId, event1);
  assert.equal(res1.success, true);
  assert.equal(res1.duplicate, false);
  assert.equal(res1.event.externalEventId, 'ext-unique-999');

  // Replay exact same event
  const res2 = await database.addRevenueEvent(workspaceId, event1);
  assert.equal(res2.success, false);
  assert.equal(res2.duplicate, true);
  assert.equal(res2.event.externalEventId, 'ext-unique-999');
});

test('different workspaces can receive the same externalEventId without collision', async () => {
  const ws1 = 'ws-tenant-A';
  const ws2 = 'ws-tenant-B';

  const ev1 = createMonetaryRevenueEvent({
    workspaceId: ws1,
    source: 'webhook',
    sourceEventType: 'donation',
    externalEventId: 'shared-event-id',
    amountMinor: 1000,
    currency: 'EUR'
  });

  const ev2 = createMonetaryRevenueEvent({
    workspaceId: ws2,
    source: 'webhook',
    sourceEventType: 'donation',
    externalEventId: 'shared-event-id',
    amountMinor: 1000,
    currency: 'EUR'
  });

  const res1 = await database.addRevenueEvent(ws1, ev1);
  const res2 = await database.addRevenueEvent(ws2, ev2);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
});

test('repeated manual contributions remain distinct and are both persisted', async () => {
  const workspaceId = 'ws-manual-persist';

  const manual1 = createManualRevenueEvent({
    workspaceId,
    amountMinor: 500,
    currency: 'USD',
    supporter: 'Manual Donor'
  });

  const manual2 = createManualRevenueEvent({
    workspaceId,
    amountMinor: 500,
    currency: 'USD',
    supporter: 'Manual Donor'
  });

  const res1 = await database.addRevenueEvent(workspaceId, manual1);
  const res2 = await database.addRevenueEvent(workspaceId, manual2);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.notEqual(res1.event.id, res2.event.id);
});

test('querying workspace revenue events supports source and synthetic filtering and pagination', async () => {
  const workspaceId = 'ws-filter-query';

  await database.addRevenueEvent(workspaceId, createMonetaryRevenueEvent({
    workspaceId,
    source: 'ecpay',
    sourceEventType: 'donation',
    externalEventId: 'ecpay-q1',
    amountMinor: 100,
    currency: 'TWD'
  }));

  await database.addRevenueEvent(workspaceId, createUnitRevenueEvent({
    workspaceId,
    source: 'webhook',
    sourceEventType: 'bits',
    externalEventId: 'bits-q2',
    quantity: 500
  }));

  await database.addRevenueEvent(workspaceId, createManualRevenueEvent({
    workspaceId,
    amountMinor: 200,
    currency: 'USD'
  }));

  const allEvents = await database.getWorkspaceRevenueEvents(workspaceId, { limit: 10 });
  assert.equal(allEvents.length, 3);

  const ecpayOnly = await database.getWorkspaceRevenueEvents(workspaceId, { source: 'ecpay' });
  assert.equal(ecpayOnly.length, 1);
  assert.equal(ecpayOnly[0].source, 'ecpay');

  const syntheticOnly = await database.getWorkspaceRevenueEvents(workspaceId, { isSynthetic: true });
  assert.equal(syntheticOnly.length, 1);
  assert.equal(syntheticOnly[0].source, 'manual');

  const nonSyntheticOnly = await database.getWorkspaceRevenueEvents(workspaceId, { isSynthetic: false });
  assert.equal(nonSyntheticOnly.length, 2);
});

test('generic webhook token generation and rotation operates per-workspace', async () => {
  const workspaceId = 'ws-token-test';

  // Seed workspace in sandbox db if not present
  const data = await database.readJSON();
  if (!data.workspaces) data.workspaces = [];
  data.workspaces.push({
    id: workspaceId,
    userId: 'user-token',
    workspaceName: 'Token Test WS',
    slug: 'token-test-ws'
  });
  await database.writeJSON(data);

  const token1 = await database.getGenericWebhookToken(workspaceId);
  assert.ok(token1 && token1.startsWith('whsec_'), `Token format invalid: ${token1}`);

  const tokenLookup = await database.findWorkspaceByGenericWebhookToken(token1);
  assert.equal(tokenLookup.id, workspaceId);

  const token2 = await database.rotateGenericWebhookToken(workspaceId);
  assert.ok(token2 && token2.startsWith('whsec_'));
  assert.notEqual(token1, token2);

  const oldLookup = await database.findWorkspaceByGenericWebhookToken(token1);
  assert.equal(oldLookup, null);

  const newLookup = await database.findWorkspaceByGenericWebhookToken(token2);
  assert.equal(newLookup.id, workspaceId);
});
