import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import database from '../lib/database.js';

// We can test the route logic directly using mock HTTP request / handleFetchWithExpress or direct DB & API validation
import { RULE_TYPES, validateGoalRule } from '../lib/goal-engine/goal-rules.js';
import { validateOutboundWebhookUrl } from '../lib/goal-engine/outbound-webhook.js';

test('Goal APIs: goal creation, activation, and full lifecycle via database integration', async () => {
  const workspaceId = uuidv4();

  // Create Goal 1
  const goal1 = await database.createGoal(workspaceId, {
    title: '500 訂閱目標',
    targetMinor: 500000,
    displayCurrency: 'TWD',
    startingAmountMinor: 50000,
    isActive: true
  });

  assert.ok(goal1.id);
  assert.equal(goal1.title, '500 訂閱目標');
  assert.equal(goal1.isActive, true);

  // Create Goal 2 (chained goal)
  const goal2 = await database.createGoal(workspaceId, {
    title: '1000 訂閱目標',
    targetMinor: 1000000,
    displayCurrency: 'TWD',
    isActive: false
  });

  // Link Goal 1 -> Goal 2
  const updatedGoal1 = await database.updateGoal(workspaceId, goal1.id, {
    nextGoalId: goal2.id
  });
  assert.equal(updatedGoal1.nextGoalId, goal2.id);

  // Update webhook rule
  const updatedRule = await database.upsertGoalRule(workspaceId, goal1.id, {
    source: 'webhook',
    enabled: true,
    ruleType: 'percentage_weighting',
    config: { percentage: 50 }
  });
  assert.equal(updatedRule.ruleType, 'percentage_weighting');

  // Update milestone with webhook action
  const updatedMilestone = await database.upsertGoalMilestone(workspaceId, goal1.id, {
    thresholdPercent: 50,
    label: '50% Halfway!',
    webhookActionUrl: 'https://example.com/streamerbot'
  });
  assert.equal(updatedMilestone.thresholdPercent, 50);
  assert.equal(updatedMilestone.webhookActionUrl, 'https://example.com/streamerbot');

  // Add manual adjustment
  const adj = await database.addGoalAdjustment(workspaceId, goal1.id, {
    amountMinor: 20000,
    reason: 'Offline Superchat'
  });
  assert.equal(adj.success, true);
  assert.equal(adj.newAmountMinor, 70000); // 50000 starting + 20000

  // Check active goal
  const activeGoal = await database.getActiveGoal(workspaceId);
  assert.equal(activeGoal.id, goal1.id);
  assert.equal(activeGoal.currentAmountMinor, 70000);

  // Reset goal
  const resetGoal = await database.resetGoalProgress(workspaceId, goal1.id);
  assert.equal(resetGoal.epoch, 2);
  assert.equal(resetGoal.currentAmountMinor, 50000);

  // Activate Goal 2 -> Goal 1 should become inactive
  const activatedGoal2 = await database.activateGoal(workspaceId, goal2.id);
  assert.equal(activatedGoal2.isActive, true);

  const goal1After = await database.getGoalById(workspaceId, goal1.id);
  assert.equal(goal1After.isActive, false);
});

test('Goal APIs: milestone webhook SSRF validation protects API from internal network access', () => {
  const prevEnv = process.env.ENVIRONMENT;
  process.env.ENVIRONMENT = 'production';
  try {
    const invalidUrl = 'http://169.254.169.254/latest/meta-data';
    const check = validateOutboundWebhookUrl(invalidUrl);
    assert.equal(check.valid, false);

    const validUrl = 'https://discord.com/api/webhooks/123/abc';
    const validCheck = validateOutboundWebhookUrl(validUrl);
    assert.equal(validCheck.valid, true);
  } finally {
    process.env.ENVIRONMENT = prevEnv;
  }
});
