import { evaluateGoalRule } from './goal-evaluator.js';
import { getCrossedMilestones } from './milestone-evaluator.js';
import { sendMilestoneWebhook } from './outbound-webhook.js';
import { handleGoalCompletionAndChaining } from './goal-chaining.js';
import { logInfo, logWarn } from '../observability.js';

/**
 * Ingests and processes a Canonical Revenue Event through the Goal Engine.
 *
 * @param {Object} params
 * @param {Object} params.database - Database interface instance
 * @param {string} params.workspaceId - Workspace ID
 * @param {Object} params.revenueEvent - Canonical Revenue Event
 * @returns {Promise<Object>} Execution report
 */
export async function processRevenueEventForGoalEngine({
  database,
  workspaceId,
  revenueEvent
}) {
  if (!database || !workspaceId || !revenueEvent) {
    throw new Error('processRevenueEventForGoalEngine requires database, workspaceId, and revenueEvent');
  }

  // 1. Find active goal for workspace
  const activeGoal = await database.getActiveGoal(workspaceId);
  if (!activeGoal) {
    logInfo('goal_evaluation_skipped_no_active_goal', {
      workspace_id: workspaceId,
      source: revenueEvent.source
    });
    return {
      success: true,
      contributed: false,
      reason: 'no_active_goal',
      activeGoal: null
    };
  }

  // 2. Retrieve rules for this goal
  const rules = await database.getGoalRules(activeGoal.id);
  const matchingRule = rules.find(r => r.source === revenueEvent.source);

  // 3. Evaluate rule
  const evaluation = evaluateGoalRule({
    goal: activeGoal,
    rule: matchingRule,
    revenueEvent
  });

  if (!evaluation.shouldContribute) {
    logInfo('goal_contribution_excluded', {
      goal_id: activeGoal.id,
      source: revenueEvent.source,
      reason: evaluation.reason
    });
    return {
      success: true,
      contributed: false,
      reason: evaluation.reason,
      activeGoal
    };
  }

  // 4. Add contribution idempotently
  const contribResult = await database.addGoalContribution(workspaceId, {
    goalId: activeGoal.id,
    revenueEventId: revenueEvent.id,
    source: revenueEvent.source,
    sourceEventType: revenueEvent.sourceEventType,
    sourceAmountMinor: revenueEvent.amount?.valueMinor ?? null,
    sourceCurrency: revenueEvent.amount?.currency ?? null,
    sourceQuantity: revenueEvent.quantity ?? null,
    sourceTier: revenueEvent.tier ?? null,
    ruleType: evaluation.ruleType,
    fxRate: evaluation.fxRate,
    fxRateProvenance: evaluation.fxRateProvenance,
    contributionMinor: evaluation.contributionMinor,
    supporterName: evaluation.supporterName,
    message: evaluation.message,
    isSynthetic: evaluation.isSynthetic,
    reason: evaluation.reason,
    metadata: {
      calculatedAt: new Date().toISOString()
    }
  });

  if (!contribResult.success && contribResult.duplicate) {
    return {
      success: true,
      contributed: false,
      duplicate: true,
      contribution: contribResult.contribution,
      activeGoal
    };
  }

  if (!contribResult.success) {
    throw new Error(contribResult.error || 'Failed to persist goal contribution');
  }

  const { contribution, previousAmountMinor, newAmountMinor, goal: updatedGoal } = contribResult;

  // 5. Evaluate milestone triggers
  const milestones = await database.getGoalMilestones(activeGoal.id);
  const existingTriggers = await database.getGoalMilestoneTriggers(activeGoal.id, activeGoal.epoch || 1);

  const crossedMilestones = getCrossedMilestones({
    milestones,
    previousAmountMinor,
    newAmountMinor,
    targetMinor: Number(activeGoal.targetMinor),
    epoch: activeGoal.epoch || 1,
    existingTriggers
  });

  const triggeredMilestones = [];

  for (const milestone of crossedMilestones) {
    const triggerRecord = await database.recordMilestoneTrigger(
      workspaceId,
      activeGoal.id,
      milestone.id,
      milestone.thresholdPercent,
      activeGoal.epoch || 1,
      contribution.id
    );

    if (triggerRecord.triggered) {
      triggeredMilestones.push({
        ...milestone,
        triggerRecord: triggerRecord.triggerRecord
      });

      // Dispatch outbound webhook if configured
      if (milestone.webhookActionUrl) {
        // Asynchronous non-blocking dispatch
        (async () => {
          try {
            const webhookResult = await sendMilestoneWebhook({
              url: milestone.webhookActionUrl,
              payload: {
                event: 'goal.milestone_reached',
                workspaceId,
                goalId: activeGoal.id,
                goalTitle: activeGoal.title,
                thresholdPercent: milestone.thresholdPercent,
                milestoneLabel: milestone.label,
                currentAmountMinor: newAmountMinor,
                targetAmountMinor: Number(activeGoal.targetMinor),
                displayCurrency: activeGoal.displayCurrency,
                timestamp: new Date().toISOString()
              }
            });

            await database.recordActionDelivery(
              workspaceId,
              activeGoal.id,
              triggerRecord.triggerRecord?.id,
              {
                actionType: 'webhook',
                targetUrl: milestone.webhookActionUrl,
                status: webhookResult.delivered ? 'delivered' : 'failed',
                httpStatus: webhookResult.httpStatus,
                errorMessage: webhookResult.error
              }
            );
          } catch (webhookErr) {
            logWarn('outbound_webhook_dispatch_failed', { error: webhookErr.message });
          }
        })();
      }
    }
  }

  // 6. Handle completion & chaining
  const completionResult = await handleGoalCompletionAndChaining({
    database,
    workspaceId,
    goal: updatedGoal,
    previousAmountMinor,
    newAmountMinor
  });

  return {
    success: true,
    contributed: true,
    duplicate: false,
    goal: updatedGoal,
    contribution,
    previousAmountMinor,
    newAmountMinor,
    triggeredMilestones,
    isCompleted: completionResult.isCompleted,
    chainedGoalActivated: completionResult.chainedGoalActivated,
    nextGoal: completionResult.nextGoal
  };
}

export default {
  processRevenueEventForGoalEngine
};
