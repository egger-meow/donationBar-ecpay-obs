import test from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';
import database from '../lib/database.js';
import {
  convertCurrencyAmount,
  getExchangeRate,
  getDefaultFxProvider,
  setFxProvider,
  resetFxProvider,
  FxConversionError,
  FxProvider,
  FixtureFxProvider
} from '../lib/fx/fx-service.js';
import { processRevenueEventForGoalEngine } from '../lib/goal-engine/goal-engine.js';
import { createMonetaryRevenueEvent } from '../lib/revenue-event.js';

test('FX Readiness: getDefaultFxProvider behavior across environments', () => {
  // Production & Staging must return null (never silent fixtures)
  assert.equal(getDefaultFxProvider({ ENVIRONMENT: 'production' }), null);
  assert.equal(getDefaultFxProvider({ ENVIRONMENT: 'staging' }), null);
  assert.equal(getDefaultFxProvider({ NODE_ENV: 'production' }), null);
  assert.equal(getDefaultFxProvider({ NODE_ENV: 'staging' }), null);

  // Sandbox & Test return FixtureFxProvider
  assert.ok(getDefaultFxProvider({ ENVIRONMENT: 'sandbox' }) instanceof FixtureFxProvider);
  assert.ok(getDefaultFxProvider({ NODE_ENV: 'test' }) instanceof FixtureFxProvider);
  assert.ok(getDefaultFxProvider({ ENVIRONMENT: 'development' }) instanceof FixtureFxProvider);
});

test('FX Readiness: production/staging with no FX provider rejects cross-currency contribution', async () => {
  const origEnv = process.env.ENVIRONMENT;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    process.env.ENVIRONMENT = 'production';
    process.env.NODE_ENV = 'production';
    setFxProvider(null);

    // 1. Same currency still works without provider
    const sameCurrency = convertCurrencyAmount({
      amountMinor: 5000,
      fromCurrency: 'TWD',
      toCurrency: 'TWD'
    });
    assert.equal(sameCurrency.targetAmountMinor, 5000);
    assert.equal(sameCurrency.fxRate, 1.0);
    assert.equal(sameCurrency.fxRateProvenance, 'same_currency');
    assert.equal(sameCurrency.fxProvider, 'system');

    // 2. Explicit creator custom rate still works without provider
    const creatorOverride = convertCurrencyAmount({
      amountMinor: 1000, // 10.00 USD
      fromCurrency: 'USD',
      toCurrency: 'TWD',
      customRate: 31.5
    });
    assert.equal(creatorOverride.targetAmountMinor, 31500); // 315.00 TWD
    assert.equal(creatorOverride.fxRate, 31.5);
    assert.equal(creatorOverride.fxRateProvenance, 'custom_override');
    assert.equal(creatorOverride.fxProvider, 'creator_override');

    // 3. Cross currency without provider or custom rate throws FX_RATE_UNAVAILABLE
    assert.throws(
      () => convertCurrencyAmount({
        amountMinor: 1000,
        fromCurrency: 'USD',
        toCurrency: 'TWD'
      }),
      (err) => err instanceof FxConversionError && err.code === 'FX_RATE_UNAVAILABLE'
    );

    // 4. Goal Engine integration in production rejects cross-currency contribution gracefully
    const workspaceId = uuidv4();
    const goal = await database.createGoal(workspaceId, {
      title: 'Production Goal',
      targetMinor: 100000,
      displayCurrency: 'TWD',
      isActive: true
    });

    const crossCurrencyEvent = createMonetaryRevenueEvent({
      workspaceId,
      source: 'webhook',
      amountMinor: 1000,
      currency: 'USD'
    });

    const result = await processRevenueEventForGoalEngine({
      database,
      workspaceId,
      revenueEvent: crossCurrencyEvent
    });

    assert.equal(result.success, true);
    assert.equal(result.contributed, false);
    assert.match(result.reason, /evaluation_failed.*No FX rate provider/);

    // Goal progress remains 0
    const freshGoal = await database.getGoalById(workspaceId, goal.id);
    assert.equal(freshGoal.currentAmountMinor, 0);
  } finally {
    process.env.ENVIRONMENT = origEnv;
    process.env.NODE_ENV = origNodeEnv;
    resetFxProvider();
  }
});

test('FX Readiness: injected fxProvider reaches evaluator in Goal Engine', async () => {
  const origEnv = process.env.ENVIRONMENT;
  try {
    process.env.ENVIRONMENT = 'production';
    setFxProvider(null); // Ensure global provider is null

    class CustomTestProvider extends FxProvider {
      constructor() {
        super('mock_bloomberg_feed');
      }
      getRate(from, to) {
        if (from === 'USD' && to === 'TWD') {
          return {
            rate: 33.5,
            provider: 'mock_bloomberg_feed',
            provenance: 'live_market_feed',
            timestamp: '2026-08-23T12:00:00.000Z'
          };
        }
        return null;
      }
    }

    const injectedProvider = new CustomTestProvider();
    const workspaceId = uuidv4();
    const goal = await database.createGoal(workspaceId, {
      title: 'Injected Provider Goal',
      targetMinor: 500000,
      displayCurrency: 'TWD',
      isActive: true
    });

    const event = createMonetaryRevenueEvent({
      workspaceId,
      source: 'webhook',
      amountMinor: 2000, // 20.00 USD
      currency: 'USD'
    });

    const result = await processRevenueEventForGoalEngine({
      database,
      workspaceId,
      revenueEvent: event,
      fxProvider: injectedProvider
    });

    assert.equal(result.success, true);
    assert.equal(result.contributed, true);
    assert.equal(result.contribution.fxRate, 33.5);
    assert.equal(result.contribution.fxProvider, 'mock_bloomberg_feed');
    assert.equal(result.contribution.fxRateProvenance, 'live_market_feed');
    assert.equal(result.contribution.fxTimestamp, '2026-08-23T12:00:00.000Z');
    assert.equal(result.contribution.fxPair, 'USD/TWD');
    assert.equal(result.contribution.contributionMinor, 67000); // 20.00 * 33.5 = 670.00 TWD
    assert.equal(result.newAmountMinor, 67000);
  } finally {
    process.env.ENVIRONMENT = origEnv;
    resetFxProvider();
  }
});

test('FX Readiness: persisted contribution contains complete snapshot and remains immutable when rates change', async () => {
  const workspaceId = uuidv4();
  const goal = await database.createGoal(workspaceId, {
    title: 'Immutable Snapshot Goal',
    targetMinor: 1000000,
    displayCurrency: 'TWD',
    isActive: true
  });

  class DynamicProvider extends FxProvider {
    constructor(rate = 32.0) {
      super('dynamic_fx');
      this.rate = rate;
    }
    getRate(from, to) {
      return {
        rate: this.rate,
        provider: 'dynamic_fx',
        provenance: 'live_feed',
        timestamp: '2026-08-23T10:00:00.000Z'
      };
    }
  }

  const dynamicProvider = new DynamicProvider(32.0);

  const event1 = createMonetaryRevenueEvent({
    workspaceId,
    source: 'webhook',
    amountMinor: 1000, // 10.00 USD
    currency: 'USD',
    supporter: 'Alice'
  });

  const res1 = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: event1,
    fxProvider: dynamicProvider
  });

  assert.equal(res1.contributed, true);
  assert.equal(res1.contribution.fxRate, 32.0);
  assert.equal(res1.contribution.fxProvider, 'dynamic_fx');
  assert.equal(res1.contribution.fxRateProvenance, 'live_feed');
  assert.equal(res1.contribution.fxTimestamp, '2026-08-23T10:00:00.000Z');
  assert.equal(res1.contribution.fxPair, 'USD/TWD');
  assert.equal(res1.contribution.contributionMinor, 32000);
  assert.equal(res1.contribution.metadata.fx.rate, 32.0);
  assert.equal(res1.contribution.metadata.fx.provider, 'dynamic_fx');

  // Mutate provider exchange rate for subsequent events: 1 USD is now 35.0 TWD
  dynamicProvider.rate = 35.0;

  // Retrieve past contributions and verify historical record remains untouched
  const contributions = await database.getGoalContributions(goal.id);
  assert.equal(contributions.length, 1);
  const historic = contributions[0];
  assert.equal(historic.fxRate, 32.0);
  assert.equal(historic.fxProvider, 'dynamic_fx');
  assert.equal(historic.fxTimestamp, '2026-08-23T10:00:00.000Z');
  assert.equal(historic.fxPair, 'USD/TWD');
  assert.equal(historic.contributionMinor, 32000);

  // New event at new rate
  const event2 = createMonetaryRevenueEvent({
    workspaceId,
    source: 'webhook',
    amountMinor: 1000, // 10.00 USD
    currency: 'USD',
    supporter: 'Bob'
  });

  const res2 = await processRevenueEventForGoalEngine({
    database,
    workspaceId,
    revenueEvent: event2,
    fxProvider: dynamicProvider
  });

  assert.equal(res2.contributed, true);
  assert.equal(res2.contribution.fxRate, 35.0);
  assert.equal(res2.contribution.contributionMinor, 35000);
  assert.equal(res2.newAmountMinor, 67000); // 32000 + 35000 = 67000

  // Historic event 1 is still 32000 @ 32.0 rate
  const allContribs = await database.getGoalContributions(goal.id);
  const c1 = allContribs.find(c => c.supporterName === 'Alice');
  const c2 = allContribs.find(c => c.supporterName === 'Bob');
  assert.equal(c1.fxRate, 32.0);
  assert.equal(c1.contributionMinor, 32000);
  assert.equal(c2.fxRate, 35.0);
  assert.equal(c2.contributionMinor, 35000);
});
