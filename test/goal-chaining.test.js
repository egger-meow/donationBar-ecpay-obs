import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import { detectGoalChainCycles, validateGoalChainingConfig, handleGoalCompletionAndChaining } from '../lib/goal-engine/goal-chaining.js';
import database from '../lib/database.js';

test('detectGoalChainCycles: detects self loops and multi-step cycles', () => {
  const goalA = { id: 'A', nextGoalId: 'B' };
  const goalB = { id: 'B', nextGoalId: 'C' };
  const goalC = { id: 'C', nextGoalId: 'A' }; // Cycle!

  const allGoals = [goalA, goalB, goalC];

  // Self loop
  assert.equal(detectGoalChainCycles('A', 'A', allGoals), true);

  // Direct cycle
  assert.equal(detectGoalChainCycles('A', 'B', [{ id: 'A', nextGoalId: 'B' }, { id: 'B', nextGoalId: 'A' }]), true);

  // Multi-step cycle
  assert.equal(detectGoalChainCycles('A', 'B', allGoals), true);

  // Valid chain without cycles: A -> B -> C -> null
  const validGoals = [
    { id: 'A', nextGoalId: 'B' },
    { id: 'B', nextGoalId: 'C' },
    { id: 'C', nextGoalId: null }
  ];
  assert.equal(detectGoalChainCycles('A', 'B', validGoals), false);
  assert.equal(detectGoalChainCycles('B', 'C', validGoals), false);
});

test('handleGoalCompletionAndChaining: completes goal and activates next goal on 100% completion', async () => {
  const workspaceId = uuidv4();

  // Create Goal B (Next Goal)
  const goalB = await database.createGoal(workspaceId, {
    title: 'Goal B: New Microphone',
    targetMinor: 50000,
    isActive: false
  });

  // Create Goal A (Primary Goal, with nextGoalId = Goal B)
  const goalA = await database.createGoal(workspaceId, {
    title: 'Goal A: New Camera',
    targetMinor: 100000,
    nextGoalId: goalB.id,
    isActive: true
  });

  // Goal A reaches 100%
  const result = await handleGoalCompletionAndChaining({
    database,
    workspaceId,
    goal: goalA,
    previousAmountMinor: 90000,
    newAmountMinor: 100000
  });

  assert.equal(result.isCompleted, true);
  assert.equal(result.chainedGoalActivated, true);
  assert.equal(result.nextGoal.id, goalB.id);
  assert.equal(result.nextGoal.isActive, true);

  // Verify Goal B is now the active goal in workspace
  const activeGoal = await database.getActiveGoal(workspaceId);
  assert.equal(activeGoal.id, goalB.id);
});

test('handleGoalCompletionAndChaining: does not re-chain if goal was already completed', async () => {
  const workspaceId = uuidv4();

  const goalB = await database.createGoal(workspaceId, {
    title: 'Goal B',
    targetMinor: 50000
  });

  const goalA = await database.createGoal(workspaceId, {
    title: 'Goal A',
    targetMinor: 100000,
    nextGoalId: goalB.id,
    isActive: true
  });

  // Goal was already at 100k, now receives another 10k (100k -> 110k)
  const result = await handleGoalCompletionAndChaining({
    database,
    workspaceId,
    goal: goalA,
    previousAmountMinor: 100000,
    newAmountMinor: 110000
  });

  assert.equal(result.isCompleted, true);
  assert.equal(result.chainedGoalActivated, false);
});

test('validateGoalChainingConfig: rejects self reference, missing target, and indirect loops at write time', () => {
  const goalA = { id: 'goal-A', nextGoalId: 'goal-B' };
  const goalB = { id: 'goal-B', nextGoalId: 'goal-C' };
  const goalC = { id: 'goal-C', nextGoalId: null };
  const allWorkspaceGoals = [goalA, goalB, goalC];

  // Self-reference
  const selfCheck = validateGoalChainingConfig('goal-A', 'goal-A', allWorkspaceGoals);
  assert.equal(selfCheck.valid, false);
  assert.equal(selfCheck.reason, 'self_reference_forbidden');

  // Non-existent target
  const missingCheck = validateGoalChainingConfig('goal-A', 'non-existent-goal-id', allWorkspaceGoals);
  assert.equal(missingCheck.valid, false);
  assert.equal(missingCheck.reason, 'target_goal_not_found_in_workspace');

  // Indirect loop: C trying to chain to A when A -> B -> C
  const loopCheck = validateGoalChainingConfig('goal-C', 'goal-A', allWorkspaceGoals);
  assert.equal(loopCheck.valid, false);
  assert.equal(loopCheck.reason, 'circular_chain_detected');

  // Valid forward chaining: C chaining to a new goal D
  const goalD = { id: 'goal-D', nextGoalId: null };
  const validCheck = validateGoalChainingConfig('goal-C', 'goal-D', [...allWorkspaceGoals, goalD]);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.reason, null);

  // Clearing nextGoalId (null) is valid
  const nullCheck = validateGoalChainingConfig('goal-A', null, allWorkspaceGoals);
  assert.equal(nullCheck.valid, true);
  assert.equal(nullCheck.reason, null);
});

