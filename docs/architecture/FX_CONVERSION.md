# Multi-Currency Foreign Exchange (FX) Engine Architecture

## 1. Overview

Donatio operates globally from Day 1. Streamers receive support from viewers worldwide in different native currencies (e.g. USD, TWD, EUR, GBP, JPY).

The **FX Service** (`lib/fx/fx-service.js`) provides:
1. **Pluggable FX Provider Architecture** (`FxProvider`, `FixtureFxProvider`, `setFxProvider`) separating external market rate feeds from test fixtures.
2. **Exact Same-Currency Conversion** ($1:1$ identity without provider lookup or rounding error).
3. **Creator-Configured Overrides** allowing creators to set fixed conversion rates (e.g. 1 USD = 32.0 TWD).
4. **Explicit Failure Semantics:** If an exchange rate cannot be resolved for a cross-currency pair, the service fails explicitly (`FX_RATE_UNAVAILABLE`) rather than silently applying stale hardcoded defaults.
5. **Provenance and Rate Snapshot:** Persisting rate, timestamp, pair, and provider metadata with every contribution.

---

## 2. Precision & Bounded Rounding Semantics

Monetary values in Donatio are represented exclusively as **integer minor units** (e.g. cents in USD/EUR/GBP, single units in JPY, cents in TWD). ISO 4217 defines currency exponents and minor unit decimal places.

### Conversion Formula & Rounding Semantics:

To convert `amountMinor` from currency $S$ (source) to currency $T$ (target) with exchange rate $R = \frac{\text{TargetRate}}{\text{SourceRate}}$:

$$\text{SourceMajor} = \frac{\text{amountMinor}}{10^{\text{sourceMinorUnit}}}$$

$$\text{TargetMajor} = \text{SourceMajor} \times R$$

$$\text{TargetMinor} = \text{Math.round}\left(\text{TargetMajor} \times 10^{\text{targetMinorUnit}}\right)$$

> [!NOTE]
> Conversion calculations are executed via IEEE-754 double precision floating point with standard **Round-Half-Up** (`Math.round`) targeting integer minor units. Bounded rounding error is constrained to at most $\pm 0.5$ minor unit per transaction. Persisted contribution records store exact integer minor units along with a full numerical rate snapshot.

---

## 3. FX Provider & Provenance Categories

When converting amounts, the engine assigns one of four provenance categories:

1. **`same_currency`**: Source currency equals target currency ($1:1$, rate `1.0`, provider `'system'`). No external lookup or floating-point conversion.
2. **`custom_override` / `creator_override`**: Workspace administrator defined a specific exchange rate for the rule or workspace.
3. **`live_provider` / `external_provider`**: Rate supplied by an active production FX provider integration.
4. **`fixture_provider`**: Deterministic rate fixture used in automated test environments.

### Environment-Aware Provider Resolution:
- In **Staging** and **Production** (`ENVIRONMENT=staging|production` or `NODE_ENV=staging|production`), `getDefaultFxProvider()` resolves to `null`. Any cross-currency contribution without a configured production provider or creator override immediately fails with `FX_RATE_UNAVAILABLE`.
- In **Sandbox**, **Test**, and **Development**, `getDefaultFxProvider()` supplies `FixtureFxProvider` for offline and deterministic test fixtures.

### Audit Snapshot & Columns:
Every record in `goal_contributions` stores:
- `source_amount_minor`: The exact minor units received in `source_currency`.
- `source_currency`: ISO 4217 code of incoming event.
- `fx_rate`: Numerical exchange rate snapshot.
- `fx_rate_provenance`: `'same_currency' | 'custom_override' | 'live_provider' | 'reference_fixed'`.
- `fx_provider`: Identifier of the provider used (`'system' | 'creator_override' | 'fixture' | custom name`).
- `fx_timestamp`: Timestamp when the exchange rate was evaluated.
- `fx_pair`: Normalized currency pair string (e.g. `'USD/TWD'`).
- `contribution_minor`: The resulting minor units credited in the goal's display currency.
- `metadata.fx`: Durable JSON snapshot containing rate, provenance, provider, timestamp, and pair.

