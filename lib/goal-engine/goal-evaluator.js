import { convertCurrencyAmount } from '../fx/fx-service.js';
import { RULE_TYPES } from './goal-rules.js';
import { normalizeRevenueCurrency, parseMinorUnitAmount } from '../money.js';

/**
 * Pure deterministic rule evaluator.
 * Evaluates how a Canonical Revenue Event affects a Goal based on its configured rule.
 *
 * @param {Object} params
 * @param {Object} params.goal - The target Goal record ({ id, displayCurrency, ... })
 * @param {Object} [params.rule] - The matching source rule ({ source, enabled, ruleType, config })
 * @param {Object} params.revenueEvent - Canonical Revenue Event
 * @returns {Object} Deterministic evaluation result
 */
export function evaluateGoalRule({ goal, rule, revenueEvent }) {
  if (!goal || !goal.id) {
    return Object.freeze({
      shouldContribute: false,
      reason: 'missing_goal'
    });
  }

  if (!revenueEvent || !revenueEvent.source) {
    return Object.freeze({
      shouldContribute: false,
      reason: 'missing_revenue_event'
    });
  }

  const goalCurrency = normalizeRevenueCurrency(goal.displayCurrency || 'TWD');
  if (!goalCurrency) {
    return Object.freeze({
      shouldContribute: false,
      reason: 'invalid_goal_currency'
    });
  }

  // If no rule exists for source or rule is disabled, exclude event
  if (!rule || rule.enabled === false) {
    return Object.freeze({
      shouldContribute: false,
      reason: 'source_disabled_or_unconfigured'
    });
  }

  const ruleType = rule.ruleType || RULE_TYPES.MONETARY_PASSTHROUGH;
  const config = rule.config || {};

  let targetContributionMinor = 0;
  let fxRate = 1.0;
  let fxProvenance = 'same_currency';
  let calculationExplanation = '';

  try {
    switch (ruleType) {
      case RULE_TYPES.MONETARY_PASSTHROUGH: {
        if (!revenueEvent.amount || revenueEvent.amount.valueMinor === null) {
          return Object.freeze({
            shouldContribute: false,
            reason: 'event_has_no_monetary_amount'
          });
        }

        const sourceAmountMinor = revenueEvent.amount.valueMinor;
        const sourceCurrency = revenueEvent.amount.currency;

        const fxResult = convertCurrencyAmount({
          amountMinor: sourceAmountMinor,
          fromCurrency: sourceCurrency,
          toCurrency: goalCurrency
        });

        targetContributionMinor = fxResult.targetAmountMinor;
        fxRate = fxResult.fxRate;
        fxProvenance = fxResult.fxRateProvenance;
        calculationExplanation = `100% monetary passthrough (${sourceCurrency} -> ${goalCurrency})`;
        break;
      }

      case RULE_TYPES.PERCENTAGE_WEIGHTING: {
        if (!revenueEvent.amount || revenueEvent.amount.valueMinor === null) {
          return Object.freeze({
            shouldContribute: false,
            reason: 'event_has_no_monetary_amount'
          });
        }

        const percentage = Number(config.percentage ?? 100);
        const sourceAmountMinor = revenueEvent.amount.valueMinor;
        const sourceCurrency = revenueEvent.amount.currency;

        // Apply percentage in source currency minor units
        const weightedMinor = Math.round(sourceAmountMinor * (percentage / 100));

        const fxResult = convertCurrencyAmount({
          amountMinor: weightedMinor,
          fromCurrency: sourceCurrency,
          toCurrency: goalCurrency
        });

        targetContributionMinor = fxResult.targetAmountMinor;
        fxRate = fxResult.fxRate;
        fxProvenance = fxResult.fxRateProvenance;
        calculationExplanation = `${percentage}% weighting of ${sourceCurrency} amount -> ${goalCurrency}`;
        break;
      }

      case RULE_TYPES.UNIT_CONVERSION: {
        const quantity = Number(revenueEvent.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
          return Object.freeze({
            shouldContribute: false,
            reason: 'event_has_no_quantity'
          });
        }

        const unitsPerRate = Number(config.units ?? 100);
        const rateMinor = Number(config.rateMinor ?? 100);
        const rateCurrency = normalizeRevenueCurrency(config.currency || 'USD');

        // quantity units converted to rateCurrency minor units
        const rawMinor = Math.round((quantity / unitsPerRate) * rateMinor);

        const fxResult = convertCurrencyAmount({
          amountMinor: rawMinor,
          fromCurrency: rateCurrency,
          toCurrency: goalCurrency
        });

        targetContributionMinor = fxResult.targetAmountMinor;
        fxRate = fxResult.fxRate;
        fxProvenance = fxResult.fxRateProvenance;
        calculationExplanation = `${quantity} units @ ${unitsPerRate} units = ${rateMinor} ${rateCurrency} -> ${goalCurrency}`;
        break;
      }

      case RULE_TYPES.FIXED_AMOUNT: {
        const fixedMinor = Number(config.amountMinor ?? 0);
        const fixedCurrency = normalizeRevenueCurrency(config.currency || goalCurrency);

        if (fixedMinor <= 0) {
          return Object.freeze({
            shouldContribute: false,
            reason: 'invalid_fixed_amount_config'
          });
        }

        const fxResult = convertCurrencyAmount({
          amountMinor: fixedMinor,
          fromCurrency: fixedCurrency,
          toCurrency: goalCurrency
        });

        targetContributionMinor = fxResult.targetAmountMinor;
        fxRate = fxResult.fxRate;
        fxProvenance = fxResult.fxRateProvenance;
        calculationExplanation = `Fixed contribution of ${fixedMinor} ${fixedCurrency} -> ${goalCurrency}`;
        break;
      }

      case RULE_TYPES.TIER_RULES: {
        const tier = String(revenueEvent.tier || 'default').trim().toLowerCase();
        const tierAmounts = config.tierAmounts || {};
        const tierMinor = Number(tierAmounts[tier] ?? tierAmounts.default ?? 0);
        const tierCurrency = normalizeRevenueCurrency(config.currency || goalCurrency);

        if (tierMinor <= 0) {
          return Object.freeze({
            shouldContribute: false,
            reason: `unconfigured_tier_${tier}`
          });
        }

        const quantity = Number(revenueEvent.quantity || 1);
        const totalTierMinor = tierMinor * quantity;

        const fxResult = convertCurrencyAmount({
          amountMinor: totalTierMinor,
          fromCurrency: tierCurrency,
          toCurrency: goalCurrency
        });

        targetContributionMinor = fxResult.targetAmountMinor;
        fxRate = fxResult.fxRate;
        fxProvenance = fxResult.fxRateProvenance;
        calculationExplanation = `Tier '${tier}' (${quantity}x @ ${tierMinor} ${tierCurrency}) -> ${goalCurrency}`;
        break;
      }

      default:
        return Object.freeze({
          shouldContribute: false,
          reason: `unsupported_rule_type_${ruleType}`
        });
    }
  } catch (err) {
    return Object.freeze({
      shouldContribute: false,
      reason: `evaluation_failed: ${err.message}`
    });
  }

  if (targetContributionMinor < 0) {
    targetContributionMinor = 0;
  }

  return Object.freeze({
    shouldContribute: true,
    contributionMinor: targetContributionMinor,
    currency: goalCurrency,
    ruleType,
    fxRate,
    fxRateProvenance: fxProvenance,
    reason: calculationExplanation,
    supporterName: revenueEvent.supporter?.displayName || null,
    message: revenueEvent.message || null,
    isSynthetic: Boolean(revenueEvent.isSynthetic)
  });
}

export default {
  evaluateGoalRule
};
