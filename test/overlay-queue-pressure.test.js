import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationQueue } from '../public/js/overlay/presentation-queue.js';

test('PresentationQueue: retains all critical milestone events under queue flood (>30 events)', async () => {
  const presented = [];
  let finishQueuePromiseResolve;
  const finishQueuePromise = new Promise(resolve => {
    finishQueuePromiseResolve = resolve;
  });

  const queue = new PresentationQueue({
    onPresent: async (item) => {
      presented.push(item);
      await new Promise(r => setTimeout(r, 2));
    },
    onQueueEmpty: () => {
      if (finishQueuePromiseResolve) {
        finishQueuePromiseResolve();
      }
    }
  });

  // 1. Enqueue 5 critical milestone events
  for (let i = 1; i <= 5; i++) {
    queue.enqueue({
      type: 'milestone',
      goalId: 'goal-flood',
      thresholdPercent: i * 20,
      epoch: 1
    });
  }

  // 2. Flood with 40 low-priority transient donation alerts
  for (let j = 1; j <= 40; j++) {
    queue.enqueue({
      type: 'donation_alert',
      alertId: `flood-alert-${j}`,
      payer: `Viewer ${j}`,
      amount: 100
    });
  }

  // 3. Enqueue 1 100% completion celebration
  queue.enqueue({
    type: 'goal_completion',
    goalId: 'goal-flood',
    epoch: 1
  });

  // Wait for the queue to drain completely
  await finishQueuePromise;

  // Verify that all 5 milestones and 1 completion were presented
  const presentedMilestones = presented.filter(p => p.type === 'milestone');
  const presentedCompletions = presented.filter(p => p.type === 'goal_completion');

  assert.equal(presentedMilestones.length, 5, 'All 5 milestone events must be presented without loss');
  assert.equal(presentedCompletions.length, 1, 'Goal completion event must be presented without loss');
  assert.deepEqual(
    presentedMilestones.map(m => m.thresholdPercent),
    [20, 40, 60, 80, 100]
  );
});
