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
 * Validates a proposed next-goal assignment at write time.
 *
 * @param {string|null} goalId - The goal being created/modified (null for new goals before ID assignment)
 * @param {string|null} nextGoalId - The proposed next goal ID
 * @param {Array<Object>} allWorkspaceGoals - All existing goals in the same workspace
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateGoalChainingConfig(goalId, nextGoalId, allWorkspaceGoals = []) {
  if (!nextGoalId) {
    return { valid: true, reason: null };
  }

  if (goalId && goalId === nextGoalId) {
    return { valid: false, reason: 'self_reference_forbidden' };
  }

  const targetGoal = allWorkspaceGoals.find(g => g.id === nextGoalId);
  if (!targetGoal) {
    return { valid: false, reason: 'target_goal_not_found_in_workspace' };
  }

  if (goalId) {
    const hasCycle = detectGoalChainCycles(goalId, nextGoalId, allWorkspaceGoals);
    if (hasCycle) {
      return { valid: false, reason: 'circular_chain_detected' };
    }
  }

  return { valid: true, reason: null };
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
  validateGoalChainingConfig,
  handleGoalCompletionAndChaining
};

