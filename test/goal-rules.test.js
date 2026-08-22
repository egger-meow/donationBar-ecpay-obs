import test from 'node:test';
import assert from 'node:assert/strict';
import { RULE_TYPES, validateGoalRule } from '../lib/goal-engine/goal-rules.js';

test('validateGoalRule: validates monetary passthrough rule for active sources', () => {
  const rule = validateGoalRule({
    source: 'ecpay',
    enabled: true,
    ruleType: 'monetary_passthrough'
  });

  assert.equal(rule.source, 'ecpay');
  assert.equal(rule.enabled, true);
  assert.equal(rule.ruleType, 'monetary_passthrough');
  assert.deepEqual(rule.config, {});
});

test('validateGoalRule: validates percentage weighting rule', () => {
  const rule = validateGoalRule({
    source: 'webhook',
    enabled: true,
    ruleType: 'percentage_weighting',
    config: { percentage: 50 }
  });

  assert.equal(rule.ruleType, 'percentage_weighting');
  assert.equal(rule.config.percentage, 50);
  assert.equal(rule.config.percentageBasisPoints, 5000);
});

test('validateGoalRule: validates unit conversion rule', () => {
  const rule = validateGoalRule({
    source: 'webhook',
    enabled: true,
    ruleType: 'unit_conversion',
    config: {
      units: 100,
      rateMinor: 100,
      currency: 'USD'
    }
  });

  assert.equal(rule.ruleType, 'unit_conversion');
  assert.equal(rule.config.units, 100);
  assert.equal(rule.config.rateMinor, 100);
  assert.equal(rule.config.currency, 'USD');
});

test('validateGoalRule: validates fixed amount and tier rules', () => {
  const fixed = validateGoalRule({
    source: 'manual',
    ruleType: 'fixed_amount',
    config: { amountMinor: 250, currency: 'USD' }
  });
  assert.equal(fixed.config.amountMinor, 250);

  const tiers = validateGoalRule({
    source: 'test',
    ruleType: 'tier_rules',
    config: {
      tierAmounts: { tier1: 250, tier2: 500, tier3: 1250 },
      currency: 'USD'
    }
  });
  assert.deepEqual(tiers.config.tierAmounts, { tier1: 250, tier2: 500, tier3: 1250 });
});

test('validateGoalRule: rejects planned Stage 5 sources from being selected in Stage 3', () => {
  assert.throws(
    () => validateGoalRule({ source: 'twitch', ruleType: 'monetary_passthrough' }),
    /planned for future stages/
  );

  assert.throws(
    () => validateGoalRule({ source: 'kofi', ruleType: 'monetary_passthrough' }),
    /planned for future stages/
  );

  assert.throws(
    () => validateGoalRule({ source: 'youtube', ruleType: 'monetary_passthrough' }),
    /planned for future stages/
  );
});

test('validateGoalRule: rejects invalid rule configurations', () => {
  assert.throws(
    () => validateGoalRule({ source: 'ecpay', ruleType: 'invalid_rule_type' }),
    /Invalid rule type/
  );

  assert.throws(
    () => validateGoalRule({ source: 'webhook', ruleType: 'percentage_weighting', config: { percentage: -10 } }),
    /Percentage weighting must be a positive number/
  );

  assert.throws(
    () => validateGoalRule({ source: 'webhook', ruleType: 'unit_conversion', config: { units: 0 } }),
    /Unit conversion requires units >= 1/
  );
});
