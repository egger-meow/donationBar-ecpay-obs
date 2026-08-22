# Multi-Currency Foreign Exchange (FX) Engine Architecture

## 1. Overview

Donatio operates globally from Day 1. Streamers receive support from viewers worldwide in different native currencies (e.g. USD, TWD, EUR, GBP, JPY).

The **FX Service** (`lib/fx/fx-service.js`) provides:
1. **Zero-float integer conversion** between all major ISO 4217 currencies.
2. **Canonical Exchange Rate Registry** with base currency USD.
3. **Workspace Custom Overrides** allowing creators to set fixed conversion rates (e.g. 1 USD = 32.0 TWD).
4. **Provenance and Audit Metadata** tracking rate origin on every contribution record.

---

## 2. Integer Arithmetic & Precision

Monetary values in Donatio are represented exclusively as **integer minor units** (e.g. cents in USD/EUR/GBP, single units in JPY, cents in TWD).

### Canonical Conversion Formula:

To convert `amountMinor` from currency $S$ (source) to currency $T$ (target):

$$\text{SourceMajor} = \frac{\text{amountMinor}}{10^{\text{sourceMinorUnit}}}$$

$$\text{TargetMajor} = \text{SourceMajor} \times \frac{\text{TargetRate}}{\text{SourceRate}}$$

$$\text{TargetMinor} = \text{Round}\left(\text{TargetMajor} \times 10^{\text{targetMinorUnit}}\right)$$

### Canonical ISO 4217 Registry (USD Base = 1.00):

| Currency | ISO Code | Minor Unit Decimals | Standard Rate (per 1 USD) |
|---|---|---|---|
| US Dollar | `USD` | 2 | `1.00` |
| New Taiwan Dollar | `TWD` | 2 | `32.00` |
| Euro | `EUR` | 2 | `0.92` |
| British Pound | `GBP` | 2 | `0.78` |
| Japanese Yen | `JPY` | 0 | `155.00` |

---

## 3. FX Provenance Tracking

When converting amounts, the engine assigns one of three provenance categories:

1. **`identity`**: Source currency equals target currency ($1:1$). Rate used is `1.000000`. No conversion necessary.
2. **`custom_override`**: Workspace administrator defined a specific exchange rate for the currency pair.
3. **`canonical_registry`**: Converted using the deterministic built-in ISO 4217 registry.

### Audit Snapshot:
Every record in `goal_contributions` stores:
- `raw_amount_minor`: The exact minor units received in `raw_currency`.
- `raw_currency`: ISO 4217 code of incoming event.
- `fx_rate_used`: The numerical exchange rate multiplier.
- `fx_provenance`: `'identity' | 'custom_override' | 'canonical_registry'`.
- `contribution_amount_minor`: The resulting minor units credited in the goal's display currency.
