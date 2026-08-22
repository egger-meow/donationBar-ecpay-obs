import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGoalRule } from '../lib/goal-engine/goal-evaluator.js';
import { createMonetaryRevenueEvent, createUnitRevenueEvent, createSubscriptionRevenueEvent } from '../lib/revenue-event.js';

const mockGoalUSD = {
  id: 'goal-usd-1',
  title: 'USD Goal',
  displayCurrency: 'USD',
  targetMinor: 200000
};

const mockGoalTWD = {
  id: 'goal-twd-1',
  title: 'TWD Goal',
  displayCurrency: 'TWD',
  targetMinor: 1000000
};

test('evaluateGoalRule: monetary passthrough same currency', () => {
  const event = createMonetaryRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    amountMinor: 2500, // 25.00 USD
    currency: 'USD',
    supporter: 'Alice',
    message: 'Awesome!'
  });

  const rule = {
    source: 'webhook',
    enabled: true,
    ruleType: 'monetary_passthrough'
  };

  const result = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: event });

  assert.equal(result.shouldContribute, true);
  assert.equal(result.contributionMinor, 2500);
  assert.equal(result.currency, 'USD');
  assert.equal(result.fxRate, 1.0);
  assert.equal(result.fxRateProvenance, 'same_currency');
  assert.equal(result.supporterName, 'Alice');
  assert.equal(result.message, 'Awesome!');
});

test('evaluateGoalRule: monetary passthrough cross currency with FX (TWD -> USD)', () => {
  // 320.00 TWD = 32000 minor -> 10.00 USD = 1000 minor
  const event = createMonetaryRevenueEvent({
    workspaceId: 'ws-1',
    source: 'ecpay',
    amountMinor: 32000,
    currency: 'TWD',
    supporter: 'Bob'
  });

  const rule = {
    source: 'ecpay',
    enabled: true,
    ruleType: 'monetary_passthrough'
  };

  const result = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: event });

  assert.equal(result.shouldContribute, true);
  assert.equal(result.contributionMinor, 1000);
  assert.equal(result.currency, 'USD');
  assert.equal(result.fxRate, 0.03125);
  assert.equal(result.fxRateProvenance, 'reference_fixed');
});

test('evaluateGoalRule: percentage weighting rule (50% weighting)', () => {
  // 100.00 USD (10000 minor) -> 50% = 50.00 USD (5000 minor) -> in TWD goal (rate 32) = 1600.00 TWD (160000 minor)
  const event = createMonetaryRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    amountMinor: 10000,
    currency: 'USD'
  });

  const rule = {
    source: 'webhook',
    enabled: true,
    ruleType: 'percentage_weighting',
    config: { percentage: 50 }
  };

  const result = evaluateGoalRule({ goal: mockGoalTWD, rule, revenueEvent: event });

  assert.equal(result.shouldContribute, true);
  assert.equal(result.contributionMinor, 160000);
  assert.equal(result.currency, 'TWD');
});

test('evaluateGoalRule: unit conversion rule (100 bits = $1.00 USD)', () => {
  // 500 units @ 100 units = 100 minor USD ($1.00) -> 500 minor USD ($5.00)
  const event = createUnitRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    quantity: 500,
    supporter: 'Cheerer'
  });

  const rule = {
    source: 'webhook',
    enabled: true,
    ruleType: 'unit_conversion',
    config: {
      units: 100,
      rateMinor: 100,
      currency: 'USD'
    }
  };

  const result = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: event });

  assert.equal(result.shouldContribute, true);
  assert.equal(result.contributionMinor, 500);
  assert.equal(result.currency, 'USD');
});

test('evaluateGoalRule: fixed amount rule', () => {
  const event = createSubscriptionRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    tier: 'tier1',
    quantity: 1
  });

  const rule = {
    source: 'webhook',
    enabled: true,
    ruleType: 'fixed_amount',
    config: {
      amountMinor: 250, // 2.50 USD
      currency: 'USD'
    }
  };

  const result = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: event });

  assert.equal(result.shouldContribute, true);
  assert.equal(result.contributionMinor, 250);
  assert.equal(result.currency, 'USD');
});

test('evaluateGoalRule: tier-specific rule architecture', () => {
  const rule = {
    source: 'webhook',
    enabled: true,
    ruleType: 'tier_rules',
    config: {
      tierAmounts: {
        tier1: 250,   // $2.50
        tier2: 500,   // $5.00
        tier3: 1250   // $12.50
      },
      currency: 'USD'
    }
  };

  const tier1Event = createSubscriptionRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    tier: 'tier1'
  });
  const res1 = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: tier1Event });
  assert.equal(res1.contributionMinor, 250);

  const tier2Event = createSubscriptionRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    tier: 'tier2'
  });
  const res2 = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: tier2Event });
  assert.equal(res2.contributionMinor, 500);

  const tier3Event = createSubscriptionRevenueEvent({
    workspaceId: 'ws-1',
    source: 'webhook',
    tier: 'tier3'
  });
  const res3 = evaluateGoalRule({ goal: mockGoalUSD, rule, revenueEvent: tier3Event });
  assert.equal(res3.contributionMinor, 1250);
});

test('evaluateGoalRule: disabled rule or missing rule excludes contribution safely', () => {
  const event = createMonetaryRevenueEvent({
    workspaceId: 'ws-1',
    source: 'ecpay',
    amountMinor: 1000,
    currency: 'TWD'
  });

  const disabledRule = {
    source: 'ecpay',
    enabled: false,
    ruleType: 'monetary_passthrough'
  };

  const resultDisabled = evaluateGoalRule({ goal: mockGoalUSD, rule: disabledRule, revenueEvent: event });
  assert.equal(resultDisabled.shouldContribute, false);
  assert.equal(resultDisabled.reason, 'source_disabled_or_unconfigured');

  const resultNoRule = evaluateGoalRule({ goal: mockGoalUSD, rule: null, revenueEvent: event });
  assert.equal(resultNoRule.shouldContribute, false);
});
