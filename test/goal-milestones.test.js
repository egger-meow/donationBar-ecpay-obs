import test from 'node:test';
import assert from 'node:assert/strict';
import { getCrossedMilestones } from '../lib/goal-engine/milestone-evaluator.js';

const mockMilestones = [
  { id: 'm-25', thresholdPercent: 25, label: '25%', enabled: true },
  { id: 'm-50', thresholdPercent: 50, label: '50%', enabled: true },
  { id: 'm-75', thresholdPercent: 75, label: '75%', enabled: true },
  { id: 'm-100', thresholdPercent: 100, label: '100%', enabled: true }
];

test('getCrossedMilestones: crossing exactly 25%', () => {
  const crossed = getCrossedMilestones({
    milestones: mockMilestones,
    previousAmountMinor: 20000, // 20%
    newAmountMinor: 25000,      // 25%
    targetMinor: 100000
  });

  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].thresholdPercent, 25);
});

test('getCrossedMilestones: jumping 49% -> 76% triggers both 50% and 75% in order', () => {
  const crossed = getCrossedMilestones({
    milestones: mockMilestones,
    previousAmountMinor: 49000, // 49%
    newAmountMinor: 76000,      // 76%
    targetMinor: 100000
  });

  assert.equal(crossed.length, 2);
  assert.equal(crossed[0].thresholdPercent, 50);
  assert.equal(crossed[1].thresholdPercent, 75);
});

test('getCrossedMilestones: reaching and overshooting 100%', () => {
  const crossed = getCrossedMilestones({
    milestones: mockMilestones,
    previousAmountMinor: 80000,  // 80%
    newAmountMinor: 120000,      // 120% (overshoot)
    targetMinor: 100000
  });

  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].thresholdPercent, 100);
});

test('getCrossedMilestones: filters out already triggered milestones in current epoch', () => {
  const existingTriggers = [
    { epoch: 1, thresholdPercent: 50 }
  ];

  const crossed = getCrossedMilestones({
    milestones: mockMilestones,
    previousAmountMinor: 45000, // 45%
    newAmountMinor: 80000,      // 80%
    targetMinor: 100000,
    epoch: 1,
    existingTriggers
  });

  // 50% already triggered in epoch 1, so only 75% should be returned
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].thresholdPercent, 75);
});

test('getCrossedMilestones: no progression or negative change triggers nothing', () => {
  const crossed = getCrossedMilestones({
    milestones: mockMilestones,
    previousAmountMinor: 50000,
    newAmountMinor: 50000,
    targetMinor: 100000
  });

  assert.equal(crossed.length, 0);
});

test('getCrossedMilestones: preserves visualAction, soundAction and label', () => {
  const customMilestones = [
    { id: 'm-50', thresholdPercent: 50, label: 'Halfway!', visualAction: true, soundAction: true, enabled: true },
    { id: 'm-75', thresholdPercent: 75, label: 'Three Quarters!', visualAction: false, soundAction: true, enabled: true }
  ];

  const crossed = getCrossedMilestones({
    milestones: customMilestones,
    previousAmountMinor: 49000, // 49%
    newAmountMinor: 76000,      // 76%
    targetMinor: 100000
  });

  assert.equal(crossed.length, 2);
  assert.equal(crossed[0].thresholdPercent, 50);
  assert.equal(crossed[0].label, 'Halfway!');
  assert.equal(crossed[0].visualAction, true);
  assert.equal(crossed[0].soundAction, true);

  assert.equal(crossed[1].thresholdPercent, 75);
  assert.equal(crossed[1].label, 'Three Quarters!');
  assert.equal(crossed[1].visualAction, false);
  assert.equal(crossed[1].soundAction, true);
});

