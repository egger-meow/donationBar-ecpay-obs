/**
 * Evaluates which milestones were crossed between previous and new progress amounts.
 *
 * @param {Object} params
 * @param {Array<Object>} params.milestones - Configured milestones for the goal
 * @param {number} params.previousAmountMinor - Progress amount before contribution
 * @param {number} params.newAmountMinor - Progress amount after contribution
 * @param {number} params.targetMinor - Target goal amount
 * @param {number} [params.epoch=1] - Current goal epoch
 * @param {Array<Object>} [params.existingTriggers=[]] - Already triggered milestones
 * @returns {Array<Object>} List of newly crossed milestone objects to trigger in order
 */
export function getCrossedMilestones({
  milestones = [],
  previousAmountMinor = 0,
  newAmountMinor = 0,
  targetMinor,
  epoch = 1,
  existingTriggers = []
}) {
  if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0) {
    return [];
  }

  // Calculate percentages (integer 0 - 100+)
  const prevPercent = Math.min(100, Math.floor((Math.max(0, previousAmountMinor) / targetMinor) * 100));
  const newPercent = Math.min(100, Math.floor((Math.max(0, newAmountMinor) / targetMinor) * 100));

  if (newPercent <= prevPercent) {
    return [];
  }

  const triggeredPercentagesInEpoch = new Set(
    existingTriggers
      .filter(t => (t.epoch || 1) === epoch)
      .map(t => Number(t.thresholdPercent))
  );

  // Find enabled milestones within (prevPercent, newPercent] range
  const crossed = milestones
    .filter(m => m.enabled !== false)
    .filter(m => {
      const threshold = Number(m.thresholdPercent);
      return threshold > prevPercent && threshold <= newPercent;
    })
    .filter(m => !triggeredPercentagesInEpoch.has(Number(m.thresholdPercent)))
    .sort((a, b) => Number(a.thresholdPercent) - Number(b.thresholdPercent));

  return crossed;
}

export default {
  getCrossedMilestones
};
