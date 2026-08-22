# Goal Source Rules & Evaluator Architecture

## 1. Overview

Creators monetize through heterogeneous channels with differing economics, platforms, and conventions:
- Pure cash donations (e.g. ECPay, credit cards, bank transfer)
- Platform virtual currencies (e.g. Twitch Bits, YouTube Super Chats)
- Multi-tier monthly subscriptions (e.g. Tier 1, Tier 2, Tier 3)
- Custom sponsorship events or external webhook triggers (e.g. Streamer.bot events)

The **Goal Rules Engine** (`lib/goal-engine/goal-rules.js` and `lib/goal-engine/goal-evaluator.js`) gives creators no-code flexibility to define how raw incoming revenue events contribute to their active goal.

---

## 2. Canonical Rule Types

| Rule Type | Purpose | Mathematical Conversion | Example Use Case |
|---|---|---|---|
| `monetary_passthrough` | Direct 1:1 monetary value with currency conversion | `AmountInGoalCurrency = FX(RawAmount, RawCurrency, GoalCurrency)` | ECPay TWD donation -> TWD Goal (100%), or USD card donation -> TWD Goal |
| `percentage_weighting` | Proportional contribution multiplier | `AmountInGoalCurrency = FX(RawAmount, RawCurrency, GoalCurrency) * (percentage / 100)` | 50% contribution weight for high-fee payment methods, or 200% double-credit event |
| `unit_conversion` | Fixed currency value per integer unit | `AmountInGoalCurrency = Round(UnitCount * RateInGoalCurrencyMinor)` | Twitch Bits: 100 Bits = $1.00 USD (rate = 1 minor unit per bit) |
| `fixed_amount` | Fixed goal credit per event regardless of raw amount | `AmountInGoalCurrency = FixedAmountMinor` | "Every Super Chat counts as $5 towards the goal" |
| `tier_rules` | Lookup table mapped to subscription or tier names | `AmountInGoalCurrency = TierConfig[tierName]` | Tier 1 = $2.50 (`250`), Tier 2 = $5.00 (`500`), Tier 3 = $12.50 (`1250`) |
| `manual_adjustment` | Direct positive or negative administrator correction | `AmountInGoalCurrency = AdjustmentAmountMinor` | Offline cash tip (+$500), chargeback deduction (-$200) |

---

## 3. Strict Validation & Stage Constraints

To ensure data integrity and prevent misconfigurations:
1. **Planned Source Protection:**
   Sources planned for future stages (e.g. `twitch`, `youtube`, `kofi`, `stripe` in Stage 5) **cannot** be configured in Stage 3 source rules. Attempts will throw validation error `invalid_source: Planned future source cannot be configured in Stage 3`.
2. **Config Schema Validation:**
   - `percentage_weighting`: requires integer `percentage > 0` (e.g. 1 to 1000).
   - `unit_conversion`: requires positive numeric `rate > 0` and optional `unit_name`.
   - `fixed_amount`: requires non-negative integer `amount_minor >= 0`.
   - `tier_rules`: requires object mapping tier keys (`'1'`, `'2'`, `'3'`) to non-negative integer minor units.
3. **Immutability of Evaluation:**
   Rule evaluation is a pure, side-effect-free function:
   ```javascript
   evaluateGoalRule({
     revenueEvent,
     sourceRule,
     goalCurrency,
     fxService
   }) => {
     contributionAmountMinor,
     rawAmountMinor,
     rawCurrency,
     fxRateUsed,
     fxProvenance,
     ruleApplied,
     reason
   }
   ```

---

## 4. Audit Rationale & Reason Tracking

Every evaluated rule returns a human-readable `reason` string that is permanently attached to the contribution record.

Examples:
- `monetary_passthrough (identity)`
- `monetary_passthrough (converted 100 USD -> 3200 TWD @ 32)`
- `percentage_weighting (50% applied: 200 -> 100)`
- `unit_conversion (500 bits @ 0.01 = 500 minor units)`
- `tier_rules (tier 1 mapped to 250 minor units)`
- `manual_adjustment (Offline cash sponsorship)`
