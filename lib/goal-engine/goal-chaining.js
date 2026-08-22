import { logInfo, logWarn } from '../observability.js';

/**
 * Checks for circular references in a proposed next-goal assignment.
 * @param {string} goalId - The goal being modified
 * @param {string|null} nextGoalId - The proposed next goal ID
 * @param {Array<Object>} allWorkspaceGoals - All goals belonging to the workspace
 * @returns {boolean} True if a cycle was detected
 */
export function detectGoalChainCycles(goalId, nextGoalId, allWorkspaceGoals = []) {
  if (!nextGoalId) return false;
  if (goalId === nextGoalId) return true;

  const goalMap = new Map(allWorkspaceGoals.map(g => [g.id, g]));
  const visited = new Set([goalId]);
  let currentId = nextGoalId;

  while (currentId) {
    if (visited.has(currentId)) {
      return true; // Cycle detected!
    }
    visited.add(currentId);
    const currentGoal = goalMap.get(currentId);
    currentId = currentGoal?.nextGoalId || null;
  }

  return false;
}

/**
 * Handles goal completion and optional automatic next-goal activation.
 *
 * @param {Object} params
 * @param {Object} params.database - Database instance
 * @param {string} params.workspaceId - Workspace ID
 * @param {Object} params.goal - The goal that was updated
 * @param {number} params.previousAmountMinor - Previous amount
 * @param {number} params.newAmountMinor - Current amount after contribution
 * @returns {Promise<{ isCompleted: boolean, chainedGoalActivated: boolean, nextGoal: Object|null }>}
 */
export async function handleGoalCompletionAndChaining({
  database,
  workspaceId,
  goal,
  previousAmountMinor,
  newAmountMinor
}) {
  const targetMinor = Number(goal.targetMinor);
  const wasAlreadyCompleted = previousAmountMinor >= targetMinor;
  const isNowCompleted = newAmountMinor >= targetMinor;

  if (!isNowCompleted) {
    return {
      isCompleted: false,
      chainedGoalActivated: false,
      nextGoal: null
    };
  }

  if (wasAlreadyCompleted) {
    // Already completed prior to this contribution, do not re-chain
    return {
      isCompleted: true,
      chainedGoalActivated: false,
      nextGoal: null
    };
  }

  logInfo('goal_completed', {
    goal_id: goal.id,
    workspace_id: workspaceId,
    targetMinor,
    newAmountMinor
  });

  if (!goal.nextGoalId) {
    return {
      isCompleted: true,
      chainedGoalActivated: false,
      nextGoal: null
    };
  }

  // Chaining to next goal
  try {
    const allGoals = await database.getWorkspaceGoals(workspaceId);
    const hasCycle = detectGoalChainCycles(goal.id, goal.nextGoalId, allGoals);

    if (hasCycle) {
      logWarn('goal_chain_cycle_prevented', { goal_id: goal.id, next_goal_id: goal.nextGoalId });
      return {
        isCompleted: true,
        chainedGoalActivated: false,
        nextGoal: null
      };
    }

    const nextGoal = allGoals.find(g => g.id === goal.nextGoalId);
    if (!nextGoal) {
      logWarn('goal_chain_target_not_found', { goal_id: goal.id, next_goal_id: goal.nextGoalId });
      return {
        isCompleted: true,
        chainedGoalActivated: false,
        nextGoal: null
      };
    }

    // Activate the next goal atomically
    const activatedNext = await database.activateGoal(workspaceId, nextGoal.id);

    logInfo('goal_chain_activated', {
      previous_goal_id: goal.id,
      activated_goal_id: nextGoal.id,
      workspace_id: workspaceId
    });

    return {
      isCompleted: true,
      chainedGoalActivated: true,
      nextGoal: activatedNext
    };
  } catch (err) {
    logWarn('goal_chain_activation_failed', { error: err.message });
    return {
      isCompleted: true,
      chainedGoalActivated: false,
      nextGoal: null
    };
  }
}

export default {
  detectGoalChainCycles,
  handleGoalCompletionAndChaining
};
