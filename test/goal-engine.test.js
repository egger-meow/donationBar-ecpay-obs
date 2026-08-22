import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import database from '../lib/database.js';
import { processRevenueEventForGoalEngine } from '../lib/goal-engine/goal-engine.js';
import { createMonetaryRevenueEvent, createUnitRevenueEvent } from '../lib/revenue-event.js';

test('GoalEngine: processes ECPay donation and updates active goal with milestones', async () => {
  const workspaceId = uuidv4();

  // Create active Goal
  const goal = await database.createGoal(workspaceId, {
    title: 'Stream Goal',
    targetMinor: 100000, // 1,000.00 TWD
    startingAmountMinor: 0,
    displayCurrency: 'TWD',
    isActive: true
  });

  // Event 1: 300.00 TWD (30,000 minor) -> crosses 25% milestone
  const event1 = createMonetaryRevenueEvent({
    workspaceId,
    source: 'ecpay',
    amountMinor: 30000,
    currency: 'TWD',
    supporter: 'Charlie',
    message: 'Cheer for goal!'
  });

  const res1 = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: event1
  });

  assert.equal(res1.success, true);
  assert.equal(res1.contributed, true);
  assert.equal(res1.previousAmountMinor, 0);
  assert.equal(res1.newAmountMinor, 30000);
  assert.equal(res1.goal.currentAmountMinor, 30000);
  assert.equal(res1.triggeredMilestones.length, 1);
  assert.equal(res1.triggeredMilestones[0].thresholdPercent, 25);

  // Duplicate check: replay event1
  const resDuplicate = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: event1
  });

  assert.equal(resDuplicate.success, true);
  assert.equal(resDuplicate.contributed, false);
  assert.equal(resDuplicate.duplicate, true);

  // Event 2: 500.00 TWD (50,000 minor) -> 30,000 + 50,000 = 80,000 (80%) -> crosses 50% and 75%
  const event2 = createMonetaryRevenueEvent({
    workspaceId,
    source: 'ecpay',
    amountMinor: 50000,
    currency: 'TWD',
    supporter: 'David'
  });

  const res2 = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: event2
  });

  assert.equal(res2.contributed, true);
  assert.equal(res2.newAmountMinor, 80000);
  assert.equal(res2.triggeredMilestones.length, 2);
  assert.equal(res2.triggeredMilestones[0].thresholdPercent, 50);
  assert.equal(res2.triggeredMilestones[1].thresholdPercent, 75);
});

test('GoalEngine: cross-currency FX conversion (USD webhook into TWD goal)', async () => {
  const workspaceId = uuidv4();

  const goal = await database.createGoal(workspaceId, {
    title: 'Multi-Currency Goal',
    targetMinor: 500000, // 5,000.00 TWD
    displayCurrency: 'TWD',
    isActive: true
  });

  // 10.00 USD = 1000 minor USD -> @ 32.00 rate = 320.00 TWD (32,000 minor)
  const eventUSD = createMonetaryRevenueEvent({
    workspaceId,
    source: 'webhook',
    amountMinor: 1000,
    currency: 'USD',
    supporter: 'GlobalFan'
  });

  const res = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: eventUSD
  });

  assert.equal(res.contributed, true);
  assert.equal(res.contribution.fxRate, 32.0);
  assert.equal(res.contribution.contributionMinor, 32000);
  assert.equal(res.contribution.currency, 'TWD');
  assert.equal(res.newAmountMinor, 32000);
});

test('GoalEngine: unit conversion rule (points to TWD)', async () => {
  const workspaceId = uuidv4();

  const goal = await database.createGoal(workspaceId, {
    title: 'Bits/Points Goal',
    targetMinor: 100000,
    displayCurrency: 'USD',
    isActive: true
  });

  // Configure unit rule on goal for 'webhook': 100 units = 100 minor USD ($1.00)
  await database.upsertGoalRule(workspaceId, goal.id, {
    source: 'webhook',
    enabled: true,
    ruleType: 'unit_conversion',
    config: {
      units: 100,
      rateMinor: 100,
      currency: 'USD'
    }
  });

  // Send 1,000 units
  const unitEvent = createUnitRevenueEvent({
    workspaceId,
    source: 'webhook',
    quantity: 1000,
    supporter: 'Gamer'
  });

  const res = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: unitEvent
  });

  assert.equal(res.contributed, true);
  assert.equal(res.contribution.contributionMinor, 1000); // 10.00 USD
  assert.equal(res.newAmountMinor, 1000);
});

test('GoalEngine: multi-tenant workspace isolation', async () => {
  const workspace1 = uuidv4();
  const workspace2 = uuidv4();

  const goal1 = await database.createGoal(workspace1, {
    title: 'Workspace 1 Goal',
    targetMinor: 100000,
    isActive: true
  });

  const goal2 = await database.createGoal(workspace2, {
    title: 'Workspace 2 Goal',
    targetMinor: 100000,
    isActive: true
  });

  const eventForWs1 = createMonetaryRevenueEvent({
    workspaceId: workspace1,
    source: 'ecpay',
    amountMinor: 50000,
    currency: 'TWD'
  });

  await processRevenueEventForGoalEngine({
    database,
    workspaceId: workspace1,
    revenueEvent: eventForWs1
  });

  // Goal 1 is updated to 50k
  const fetchedGoal1 = await database.getGoalById(workspace1, goal1.id);
  assert.equal(fetchedGoal1.currentAmountMinor, 50000);

  // Goal 2 remains untouched at 0
  const fetchedGoal2 = await database.getGoalById(workspace2, goal2.id);
  assert.equal(fetchedGoal2.currentAmountMinor, 0);
});
