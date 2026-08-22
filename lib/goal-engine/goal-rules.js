import { getSourceDefinition, isSourceActive } from '../source-registry.js';
import { normalizeRevenueCurrency, parseMinorUnitAmount } from '../money.js';

export const RULE_TYPES = Object.freeze({
  MONETARY_PASSTHROUGH: 'monetary_passthrough',
  PERCENTAGE_WEIGHTING: 'percentage_weighting',
  UNIT_CONVERSION: 'unit_conversion',
  FIXED_AMOUNT: 'fixed_amount',
  TIER_RULES: 'tier_rules',
  MANUAL_ADJUSTMENT: 'manual_adjustment'
});

export const VALID_RULE_TYPES = new Set(Object.values(RULE_TYPES));

/**
 * Validates a Goal Source Rule configuration.
 * @param {Object} rule
 * @returns {Object} Validated and sanitized rule object
 */
export function validateGoalRule(rule = {}) {
  if (!rule || typeof rule !== 'object') {
    throw new Error('Goal rule must be an object');
  }

  const source = String(rule.source || '').trim().toLowerCase();
  if (!source) {
    throw new Error('Goal rule source is required');
  }

  // Only active sources can be configured for live rules
  const sourceDef = getSourceDefinition(source);
  if (!sourceDef) {
    throw new Error(`Unknown revenue source: ${source}`);
  }
  if (!isSourceActive(source)) {
    throw new Error(`Source '${source}' is planned for future stages and cannot be configured in Stage 3`);
  }

  const enabled = Boolean(rule.enabled !== false);
  const ruleType = String(rule.ruleType || RULE_TYPES.MONETARY_PASSTHROUGH).trim().toLowerCase();

  if (!VALID_RULE_TYPES.has(ruleType)) {
    throw new Error(`Invalid rule type: ${ruleType}`);
  }

  const rawConfig = (rule.config && typeof rule.config === 'object') ? rule.config : {};
  const cleanConfig = {};

  switch (ruleType) {
    case RULE_TYPES.MONETARY_PASSTHROUGH:
      // No extra configuration needed
      break;

    case RULE_TYPES.PERCENTAGE_WEIGHTING: {
      let pct = 100;
      if (rawConfig.percentage !== undefined && rawConfig.percentage !== null) {
        pct = Number(rawConfig.percentage);
      } else if (rawConfig.percentageBasisPoints !== undefined && rawConfig.percentageBasisPoints !== null) {
        pct = Number(rawConfig.percentageBasisPoints) / 100;
      }

      if (!Number.isFinite(pct) || pct <= 0 || pct > 1000) {
        throw new Error('Percentage weighting must be a positive number between 0.1% and 1000%');
      }
      cleanConfig.percentage = pct;
      cleanConfig.percentageBasisPoints = Math.round(pct * 100);
      break;
    }

    case RULE_TYPES.UNIT_CONVERSION: {
      const units = Number(rawConfig.units ?? rawConfig.unitsPerRate ?? 100);
      const rateMinor = parseMinorUnitAmount(rawConfig.rateMinor ?? rawConfig.minorAmount ?? 100, { minimum: 1 });
      const currency = normalizeRevenueCurrency(rawConfig.currency || 'USD');

      if (!Number.isSafeInteger(units) || units < 1) {
        throw new Error('Unit conversion requires units >= 1');
      }
      if (!Number.isSafeInteger(rateMinor) || rateMinor < 1) {
        throw new Error('Unit conversion requires rateMinor >= 1');
      }
      if (!currency) {
        throw new Error('Unit conversion currency must be a valid ISO 4217 code');
      }

      cleanConfig.units = units;
      cleanConfig.rateMinor = rateMinor;
      cleanConfig.currency = currency;
      break;
    }

    case RULE_TYPES.FIXED_AMOUNT: {
      const amountMinor = parseMinorUnitAmount(rawConfig.amountMinor, { minimum: 1 });
      const currency = normalizeRevenueCurrency(rawConfig.currency || 'USD');

      if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
        throw new Error('Fixed amount rule requires positive integer amountMinor');
      }
      if (!currency) {
        throw new Error('Fixed amount rule currency must be a valid ISO 4217 code');
      }

      cleanConfig.amountMinor = amountMinor;
      cleanConfig.currency = currency;
      break;
    }

    case RULE_TYPES.TIER_RULES: {
      if (!rawConfig.tierAmounts || typeof rawConfig.tierAmounts !== 'object') {
        throw new Error('Tier rules require a tierAmounts map (e.g. { tier1: 250, tier2: 500 })');
      }
      const currency = normalizeRevenueCurrency(rawConfig.currency || 'USD');
      if (!currency) {
        throw new Error('Tier rules currency must be a valid ISO 4217 code');
      }

      const cleanTierAmounts = {};
      for (const [tierKey, val] of Object.entries(rawConfig.tierAmounts)) {
        const cleanTier = String(tierKey).trim().toLowerCase();
        const parsedVal = parseMinorUnitAmount(val, { minimum: 1 });
        if (/^[a-z0-9_-]{1,50}$/.test(cleanTier) && Number.isSafeInteger(parsedVal)) {
          cleanTierAmounts[cleanTier] = parsedVal;
        }
      }

      if (Object.keys(cleanTierAmounts).length === 0) {
        throw new Error('Tier rules must contain at least one valid tier mapping');
      }

      cleanConfig.tierAmounts = cleanTierAmounts;
      cleanConfig.currency = currency;
      break;
    }
  }

  return Object.freeze({
    source,
    enabled,
    ruleType,
    config: Object.freeze(cleanConfig)
  });
}

export default {
  RULE_TYPES,
  VALID_RULE_TYPES,
  validateGoalRule
};
