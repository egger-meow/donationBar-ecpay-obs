import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import database from '../lib/database.js';

test('Goal persistence: create, get, update, activate and deactivate goal', async () => {
  const workspaceId = uuidv4();

  // Create Goal
  const goal = await database.createGoal(workspaceId, {
    title: '新電腦目標',
    description: '升級實況設備',
    targetMinor: 1000000, // 10,000.00 TWD
    displayCurrency: 'TWD',
    startingAmountMinor: 100000, // 1,000.00 TWD
    isActive: false
  });

  assert.ok(goal.id);
  assert.equal(goal.workspaceId, workspaceId);
  assert.equal(goal.title, '新電腦目標');
  assert.equal(goal.targetMinor, 1000000);
  assert.equal(goal.displayCurrency, 'TWD');
  assert.equal(goal.startingAmountMinor, 100000);
  assert.equal(goal.currentAmountMinor, 100000);
  assert.equal(goal.status, 'draft');
  assert.equal(goal.isActive, false);
  assert.equal(goal.epoch, 1);

  // Default rules and milestones should be auto-seeded
  const rules = await database.getGoalRules(goal.id);
  assert.equal(rules.length, 4);
  assert.ok(rules.some(r => r.source === 'ecpay' && r.enabled === true));
  assert.ok(rules.some(r => r.source === 'webhook' && r.enabled === true));

  const milestones = await database.getGoalMilestones(goal.id);
  assert.equal(milestones.length, 4);
  assert.deepEqual(milestones.map(m => m.thresholdPercent), [25, 50, 75, 100]);

  // Activate Goal
  const activated = await database.activateGoal(workspaceId, goal.id);
  assert.equal(activated.isActive, true);
  assert.equal(activated.status, 'active');
  assert.ok(activated.activatedAt);

  const activeGoal = await database.getActiveGoal(workspaceId);
  assert.equal(activeGoal.id, goal.id);

  // Update Goal
  const updated = await database.updateGoal(workspaceId, goal.id, {
    title: '新電腦與實況設備',
    targetMinor: 1200000
  });
  assert.equal(updated.title, '新電腦與實況設備');
  assert.equal(updated.targetMinor, 1200000);

  // Deactivate Goal
  await database.deactivateGoal(workspaceId, goal.id);
  const activeAfter = await database.getActiveGoal(workspaceId);
  assert.equal(activeAfter, null);
});

test('Goal persistence: activating one goal deactivates previous active goal in same workspace', async () => {
  const workspaceId = uuidv4();

  const goalA = await database.createGoal(workspaceId, {
    title: 'Goal A',
    targetMinor: 500000,
    isActive: true
  });

  const goalB = await database.createGoal(workspaceId, {
    title: 'Goal B',
    targetMinor: 800000,
    isActive: false
  });

  assert.equal((await database.getActiveGoal(workspaceId)).id, goalA.id);

  // Activate Goal B
  await database.activateGoal(workspaceId, goalB.id);

  const active = await database.getActiveGoal(workspaceId);
  assert.equal(active.id, goalB.id);

  const fetchedA = await database.getGoalById(workspaceId, goalA.id);
  assert.equal(fetchedA.isActive, false);
});

test('Goal persistence: rules and milestone configuration updates', async () => {
  const workspaceId = uuidv4();
  const goal = await database.createGoal(workspaceId, {
    title: 'Custom Rules Goal',
    targetMinor: 500000
  });

  // Update webhook rule to percentage weighting 50%
  const updatedRule = await database.upsertGoalRule(workspaceId, goal.id, {
    source: 'webhook',
    enabled: true,
    ruleType: 'percentage_weighting',
    config: { percentage: 50 }
  });
  assert.equal(updatedRule.source, 'webhook');
  assert.equal(updatedRule.ruleType, 'percentage_weighting');

  // Update 50% milestone with outbound webhook URL
  const updatedMilestone = await database.upsertGoalMilestone(workspaceId, goal.id, {
    thresholdPercent: 50,
    label: 'Halfway point',
    webhookActionUrl: 'https://api.example.com/streamer-bot-hook'
  });
  assert.equal(updatedMilestone.thresholdPercent, 50);
  assert.equal(updatedMilestone.label, 'Halfway point');
  assert.equal(updatedMilestone.webhookActionUrl, 'https://api.example.com/streamer-bot-hook');
});

test('Goal persistence: idempotent contributions and progress calculation', async () => {
  const workspaceId = uuidv4();
  const goal = await database.createGoal(workspaceId, {
    title: 'Donation Bar Goal',
    targetMinor: 100000, // 1,000.00 TWD
    startingAmountMinor: 0,
    isActive: true
  });

  const revenueEventId = uuidv4();

  // Add contribution
  const result1 = await database.addGoalContribution(workspaceId, {
    goalId: goal.id,
    revenueEventId,
    source: 'ecpay',
    sourceEventType: 'donation',
    sourceAmountMinor: 30000,
    sourceCurrency: 'TWD',
    ruleType: 'monetary_passthrough',
    contributionMinor: 30000,
    supporterName: 'Alice',
    message: 'Good stream!'
  });

  assert.equal(result1.success, true);
  assert.equal(result1.duplicate, false);
  assert.equal(result1.newAmountMinor, 30000);
  assert.equal(result1.goal.currentAmountMinor, 30000);

  // Send duplicate contribution with same revenueEventId -> must be ignored!
  const result2 = await database.addGoalContribution(workspaceId, {
    goalId: goal.id,
    revenueEventId,
    source: 'ecpay',
    sourceEventType: 'donation',
    sourceAmountMinor: 30000,
    sourceCurrency: 'TWD',
    ruleType: 'monetary_passthrough',
    contributionMinor: 30000
  });

  assert.equal(result2.success, false);
  assert.equal(result2.duplicate, true);

  // Verify goal total didn't increase
  const currentGoal = await database.getGoalById(workspaceId, goal.id);
  assert.equal(currentGoal.currentAmountMinor, 30000);
});

test('Goal persistence: manual adjustment and reset with epoch preservation', async () => {
  const workspaceId = uuidv4();
  const goal = await database.createGoal(workspaceId, {
    title: 'Adjustment Goal',
    targetMinor: 100000,
    startingAmountMinor: 10000,
    isActive: true
  });

  // Add positive adjustment
  const adjResult = await database.addGoalAdjustment(workspaceId, goal.id, {
    amountMinor: 25000,
    reason: 'Offline cash donation from Bob'
  });

  assert.equal(adjResult.success, true);
  assert.equal(adjResult.newAmountMinor, 35000);
  assert.equal(adjResult.contribution.reason, 'Offline cash donation from Bob');
  assert.equal(adjResult.contribution.isSynthetic, true);

  // Reset Goal
  const resetGoal = await database.resetGoalProgress(workspaceId, goal.id);
  assert.equal(resetGoal.epoch, 2);
  assert.equal(resetGoal.currentAmountMinor, 10000); // Back to starting amount

  // Historical contributions should still exist in database
  const contributions = await database.getGoalContributions(goal.id);
  assert.equal(contributions.length, 1);
  assert.equal(contributions[0].epoch, 1);
});

test('Goal persistence: milestone trigger exactly-once recording per epoch', async () => {
  const workspaceId = uuidv4();
  const goal = await database.createGoal(workspaceId, {
    title: 'Milestone Trigger Goal',
    targetMinor: 100000
  });

  const milestone50 = (await database.getGoalMilestones(goal.id)).find(m => m.thresholdPercent === 50);

  // Trigger 50% milestone in epoch 1
  const firstTrigger = await database.recordMilestoneTrigger(
    workspaceId,
    goal.id,
    milestone50.id,
    50,
    1
  );
  assert.equal(firstTrigger.triggered, true);

  // Repeat in epoch 1 -> must not trigger again
  const secondTrigger = await database.recordMilestoneTrigger(
    workspaceId,
    goal.id,
    milestone50.id,
    50,
    1
  );
  assert.equal(secondTrigger.triggered, false);

  // In epoch 2 (after reset), 50% milestone can trigger once again
  const epoch2Trigger = await database.recordMilestoneTrigger(
    workspaceId,
    goal.id,
    milestone50.id,
    50,
    2
  );
  assert.equal(epoch2Trigger.triggered, true);
});
