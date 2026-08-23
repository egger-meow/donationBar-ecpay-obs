import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import database from '../lib/database.js';

test('Goal Concurrency: parallel activations in same workspace preserve single active goal invariant', async () => {
  const workspaceId = uuidv4();

  // Create 3 goals in draft status
  const goal1 = await database.createGoal(workspaceId, {
    title: 'Goal 1',
    targetMinor: 100000,
    isActive: false
  });

  const goal2 = await database.createGoal(workspaceId, {
    title: 'Goal 2',
    targetMinor: 200000,
    isActive: false
  });

  const goal3 = await database.createGoal(workspaceId, {
    title: 'Goal 3',
    targetMinor: 300000,
    isActive: false
  });

  // Activate all 3 goals concurrently
  await Promise.all([
    database.activateGoal(workspaceId, goal1.id),
    database.activateGoal(workspaceId, goal2.id),
    database.activateGoal(workspaceId, goal3.id)
  ]);

  const allGoals = await database.getWorkspaceGoals(workspaceId);
  const activeGoals = allGoals.filter(g => g.isActive === true);

  // Invariant: Exactly one goal must be active
  assert.equal(activeGoals.length, 1);
  assert.ok(['Goal 1', 'Goal 2', 'Goal 3'].includes(activeGoals[0].title));

  const activeGoal = await database.getActiveGoal(workspaceId);
  assert.ok(activeGoal);
  assert.equal(activeGoal.id, activeGoals[0].id);
});

test('Goal Concurrency: activations across distinct workspaces do not interfere with each other', async () => {
  const workspace1 = uuidv4();
  const workspace2 = uuidv4();

  const w1Goal = await database.createGoal(workspace1, {
    title: 'Workspace 1 Active Goal',
    targetMinor: 100000,
    isActive: true
  });

  const w2Goal1 = await database.createGoal(workspace2, {
    title: 'Workspace 2 Goal 1',
    targetMinor: 100000,
    isActive: false
  });

  const w2Goal2 = await database.createGoal(workspace2, {
    title: 'Workspace 2 Goal 2',
    targetMinor: 200000,
    isActive: false
  });

  // Concurrently activate goal 2 in workspace 2
  await database.activateGoal(workspace2, w2Goal2.id);

  const w1Active = await database.getActiveGoal(workspace1);
  const w2Active = await database.getActiveGoal(workspace2);

  assert.equal(w1Active.id, w1Goal.id);
  assert.equal(w1Active.isActive, true);

  assert.equal(w2Active.id, w2Goal2.id);
  assert.equal(w2Active.isActive, true);
});
