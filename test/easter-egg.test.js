import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeActivateFreePass, FREE_PASS_SECRET_CODE } from '../lib/easter-egg.js';

function fakeDatabase({ subscription } = {}) {
  const calls = { updates: [], auditLogs: [] };
  return {
    calls,
    async getUserSubscription() { return subscription; },
    async updateSubscription(userId, update) { calls.updates.push({ userId, update }); return { ...subscription, ...update }; },
    async addAuditLog(entry) { calls.auditLogs.push(entry); return entry; }
  };
}

test('exact secret phrase grants free pass, audit-logged with easter_egg source', async () => {
  const database = fakeDatabase({ subscription: { planType: 'trial', status: 'active' } });
  const granted = await maybeActivateFreePass({ database, userId: 'u1', message: `  ${FREE_PASS_SECRET_CODE}  `, feedbackId: 'f1' });

  assert.equal(granted, true);
  assert.equal(database.calls.updates.length, 1);
  assert.deepEqual(database.calls.updates[0].update, {
    planType: 'free_pass',
    status: 'active',
    isTrial: false,
    trialEndDate: null,
    pricePerMonth: 0
  });
  assert.equal(database.calls.auditLogs.length, 1);
  const log = database.calls.auditLogs[0];
  assert.equal(log.action, 'subscription.free_pass_granted');
  assert.equal(log.resourceId, 'f1');
  assert.equal(log.metadata.source, 'easter_egg');
});

test('near-miss phrases submit feedback normally without touching the subscription', async () => {
  const database = fakeDatabase({ subscription: { planType: 'trial' } });
  for (const message of [
    FREE_PASS_SECRET_CODE.toUpperCase(),           // case-sensitive
    FREE_PASS_SECRET_CODE + '!',                   // no trailing extras
    `please ${FREE_PASS_SECRET_CODE}`,             // no embedding
    '', null, undefined, 42                        // junk input
  ]) {
    assert.equal(await maybeActivateFreePass({ database, userId: 'u1', message, feedbackId: 'f1' }), false);
  }
  assert.equal(database.calls.updates.length, 0);
  assert.equal(database.calls.auditLogs.length, 0);
});

test('fires at most once per user: already-free_pass users are not re-upgraded', async () => {
  const database = fakeDatabase({ subscription: { planType: 'free_pass', status: 'active' } });
  assert.equal(await maybeActivateFreePass({ database, userId: 'u1', message: FREE_PASS_SECRET_CODE, feedbackId: 'f1' }), false);
  assert.equal(database.calls.updates.length, 0);
  assert.equal(database.calls.auditLogs.length, 0);
});

test('no subscription record means no grant', async () => {
  const database = fakeDatabase({ subscription: undefined });
  assert.equal(await maybeActivateFreePass({ database, userId: 'u1', message: FREE_PASS_SECRET_CODE, feedbackId: 'f1' }), false);
  assert.equal(database.calls.updates.length, 0);
});

test('database failure propagates so the route can log it without granting', async () => {
  const database = fakeDatabase({ subscription: { planType: 'trial' } });
  database.updateSubscription = async () => { throw new Error('db down'); };
  await assert.rejects(
    maybeActivateFreePass({ database, userId: 'u1', message: FREE_PASS_SECRET_CODE, feedbackId: 'f1' }),
    /db down/
  );
  assert.equal(database.calls.auditLogs.length, 0, 'no audit log without a successful grant');
});
