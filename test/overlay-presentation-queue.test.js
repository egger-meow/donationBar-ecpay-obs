import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationQueue } from '../public/js/overlay/presentation-queue.js';

test('PresentationQueue: processes single event and marks seen', async () => {
  const presented = [];
  const queue = new PresentationQueue({
    onPresent: async (item) => {
      presented.push(item);
      await new Promise(r => setTimeout(r, 10));
    }
  });

  const event = {
    type: 'milestone',
    goalId: 'goal-1',
    thresholdPercent: 50,
    epoch: 1
  };

  const queued = queue.enqueue(event);
  assert.equal(queued, true);

  // Re-enqueueing same event returns false (deduplicated)
  const dupQueued = queue.enqueue(event);
  assert.equal(dupQueued, false);

  // Wait for processing to complete
  await new Promise(r => setTimeout(r, 80));

  assert.equal(presented.length, 1);
  assert.equal(presented[0].thresholdPercent, 50);
  assert.equal(queue.hasSeen(event), true);
});

test('PresentationQueue: processes multi-threshold batch in sequential ascending order', async () => {
  const presented = [];
  const queue = new PresentationQueue({
    onPresent: async (item) => {
      presented.push(item.thresholdPercent);
      await new Promise(r => setTimeout(r, 15));
    }
  });

  // Batch with 100%, 50%, 75% out of order
  const milestones = [
    { type: 'milestone', goalId: 'goal-1', thresholdPercent: 100, epoch: 1 },
    { type: 'milestone', goalId: 'goal-1', thresholdPercent: 50, epoch: 1 },
    { type: 'milestone', goalId: 'goal-1', thresholdPercent: 75, epoch: 1 }
  ];

  const count = queue.enqueueBatch(milestones);
  assert.equal(count, 3);

  // Wait for queue to drain sequentially
  await new Promise(r => setTimeout(r, 250));

  // Must have presented in strictly ascending order: 50 -> 75 -> 100
  assert.deepEqual(presented, [50, 75, 100]);
  assert.equal(queue.isProcessing(), false);
  assert.equal(queue.getQueueLength(), 0);
});

test('PresentationQueue: distinguishes events across different epochs', async () => {
  const presented = [];
  const queue = new PresentationQueue({
    onPresent: async (item) => {
      presented.push(`${item.epoch}:${item.thresholdPercent}`);
    }
  });

  const mEpoch1 = { type: 'milestone', goalId: 'goal-1', thresholdPercent: 50, epoch: 1 };
  const mEpoch2 = { type: 'milestone', goalId: 'goal-1', thresholdPercent: 50, epoch: 2 };

  queue.enqueue(mEpoch1);
  queue.enqueue(mEpoch2);

  await new Promise(r => setTimeout(r, 100));

  assert.deepEqual(presented, ['1:50', '2:50']);
});

test('PresentationQueue: bounds max queue size to prevent unbounded buildup', async () => {
  const queue = new PresentationQueue({
    onPresent: async () => {
      await new Promise(r => setTimeout(r, 50));
    }
  });

  // Add 40 unique events
  for (let i = 1; i <= 40; i++) {
    queue.enqueue({ type: 'donation_alert', alertId: `alert-${i}` });
  }

  // Queue must be capped at max queue size (30)
  assert.ok(queue.getQueueLength() <= 30);
});
