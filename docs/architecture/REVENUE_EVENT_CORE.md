# Universal Revenue Event Core

## Overview

The **Universal Revenue Event Core** is the foundation of DonationBar's transformation from a single-gateway tool (ECPay) into a provider-independent, multi-source programmable revenue platform for live streamers worldwide.

```
+-------------------------------------------------------------------------------+
|                               REVENUE SOURCES                                 |
|  [ ECPay ]   [ Generic Webhook ]   [ Creator Manual ]   [ Test Mode ]   [...] |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                            SOURCE ADAPTER LAYER                               |
|  - Verify signature / token / payload                                         |
|  - Extract raw event fields (amount, units, supporter, message, timestamp)    |
|  - Derive stable external event ID                                            |
|  - Map into Canonical Revenue Event                                           |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                        CANONICAL REVENUE EVENT MODEL                          |
|  - Pure data model: "What happened at the source?"                            |
|  - Multi-currency ISO 4217 minor units (no floats)                            |
|  - Unit & subscription support                                                |
|  - Sanitized metadata (zero credentials / secret leakage)                     |
|  - Deep-frozen immutable object                                               |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                       DATABASE PERSISTENCE & IDEMPOTENCY                      |
|  - PostgreSQL `revenue_events` / JSON `revenueEvents`                         |
|  - Unique constraint: (workspace_id, source, external_event_id)               |
|  - Source-aware idempotency: replayed events return { duplicate: true }       |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                       DOWNSTREAM CONSUMERS & PROJECTIONS                      |
|  - OBS Overlay Real-Time Delivery (SSE / Events)                              |
|  - Streamer Audit History                                                     |
|  - Goal Engine & Weighting (Stage 3)                                          |
|  - Milestone Automations & Webhooks (Stage 3)                                 |
+-------------------------------------------------------------------------------+
```

---

## The Canonical Event Model

A Canonical Revenue Event represents a single factual transaction or supporter interaction that occurred at a revenue source.

```javascript
{
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",       // Internal UUID
  workspaceId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", // Tenant Workspace UUID
  source: "webhook",                                // Registered source identifier
  sourceEventType: "donation",                      // Event type (e.g. donation, bits, subscription)
  externalEventId: "ext-tx-98765",                  // Provider's transaction or event ID
  occurredAt: "2026-08-22T10:15:30.000Z",           // ISO 8601 when event occurred at source
  receivedAt: "2026-08-22T10:15:31.250Z",           // ISO 8601 when DonationBar ingested it
  amount: {
    valueMinor: 2500,                               // Integer minor units (e.g. 2500 = $25.00 USD)
    currency: "USD"                                 // ISO 4217 3-letter currency code
  },
  quantity: null,                                   // Integer for unit-based events (e.g. 500 bits)
  tier: null,                                       // Tier identifier (e.g. 'tier1', 'tier2')
  supporter: {
    displayName: "Alice",                           // Supporter's display name or handle
    externalUserId: "alice-twitch-id"               // Source-specific user ID
  },
  message: "Keep up the awesome streams!",          // Message / note attached to the event
  isSynthetic: false,                               // true for manual adjustments & test console
  metadata: {                                       // Sanitized, source-specific operational metadata
    paymentMethod: "CreditCard"
  }
}
```

### Core Invariants

1. **Separation of Source Event from Goal Contribution**:
   - The Revenue Event answers: *What happened at the source?* (e.g., "$25.00 USD received from Alice").
   - It does **not** prematurely compute Goal progress or weighting (e.g., "add 25 points to Sub Goal"). That computation belongs exclusively to the **Goal Engine** (Stage 3).
2. **Authoritative ISO 4217 Integer Minor Unit Money**:
   - Monetary values are stored as integers representing the smallest minor unit of the given ISO 4217 currency.
   - Floating-point numbers are strictly rejected at the HTTP boundary and during normalization.

---

## Money Representation & ISO 4217 Semantics

DonationBar explicitly distinguishes three representations of monetary value:

### 1. Provider-Native Transport Representation
How external payment providers or platforms encode money in their API or webhook payloads:
- **ECPay**: Transports `TradeAmt` as integer whole TWD dollars (e.g. `TradeAmt: 300` represents NT$ 300).
- **Stripe / Paddle**: Transports amounts as integer minor units (e.g. `amount: 1000` represents $10.00 USD).
- **Ko-fi**: Transports amounts as decimal string major units (e.g. `amount: "5.00"` USD).

Source adapters MUST translate provider transport formats into canonical ISO minor units during normalization.

### 2. Currency Major Units (Human-Facing)
The conventional denomination used in human communication, creator dashboards, and OBS displays:
- `$10.00 USD` (10 major units)
- `NT$ 300 TWD` (300 major units)
- `¥300 JPY` (300 major units)
- `500 HUF` (500 major units)

### 3. Canonical ISO Minor Units (Persistent Event Core)
The authoritative integer minor unit format persisted in `revenue_events.amount_minor`:
- `USD 10.00` = `1000` minor units (ISO 4217 exponent 2: $10.00 \times 100$)
- `TWD 300` = `30000` minor units (ISO 4217 exponent 2: NT$300 \times 100)
- `JPY 300` = `300` minor units (ISO 4217 exponent 0: ¥300 \times 1)
- `HUF 500` = `50000` minor units (ISO 4217 exponent 2: 500 \times 100)
- `KRW 1000` = `1000` minor units (ISO 4217 exponent 0)
- `EUR 25.50` = `2550` minor units (ISO 4217 exponent 2)

### ISO 4217 Minor Unit Exponent Reference Table

| Currency | Code | Exponent (Decimals) | Minor Unit Name | Example Major Unit | Canonical Minor Units |
|---|---|:---:|---|---|:---:|
| US Dollar | `USD` | 2 | Cent | `$10.00` | `1000` |
| Euro | `EUR` | 2 | Cent | `€10.00` | `1000` |
| Pound Sterling | `GBP` | 2 | Penny | `£10.00` | `1000` |
| New Taiwan Dollar | `TWD` | 2 | Cent (分) | `NT$300` | `30000` |
| Hungarian Forint | `HUF` | 2 | Fillér | `500 Ft` | `50000` |
| Japanese Yen | `JPY` | 0 | Yen | `¥300` | `300` |
| South Korean Won | `KRW` | 0 | Won | `₩1000` | `1000` |
| Chilean Peso | `CLP` | 0 | Peso | `$5000` | `5000` |
| Vietnamese Dong | `VND` | 0 | Dong | `20,000 ₫` | `20000` |
| Canadian Dollar | `CAD` | 2 | Cent | `$10.00` | `1000` |
| Australian Dollar | `AUD` | 2 | Cent | `$10.00` | `1000` |
| Singapore Dollar | `SGD` | 2 | Cent | `$10.00` | `1000` |
| Hong Kong Dollar | `HKD` | 2 | Cent | `$10.00` | `1000` |

3. **Immutability and Sanitization**:
   - Canonical events returned by `normalizeRevenueEvent` are deep-frozen (`Object.freeze`).
   - Metadata is scrubbed of all sensitive authentication keys, passwords, card numbers, session secrets, and credentials.
4. **Tenant Isolation**:
   - Every event is bound to a validated `workspaceId`. External webhooks and API callers cannot inject or spoof cross-tenant workspace IDs.

---

## Event Lifecycle

1. **Ingress**:
   - HTTP POST to provider webhook (`/webhook/:slug`, `/api/webhook/generic/:slug`) or authenticated dashboard endpoint (`/api/events/manual`, `/api/events/test`).
2. **Authentication & Signature Verification**:
   - ECPay: `CheckMacValue` verified against raw form body before parsing.
   - Generic Webhook: Cryptographically secure timing-safe token verification against workspace token.
   - Manual/Test: Authenticated admin session with CSRF same-origin check.
3. **Normalization**:
   - Source adapter translates raw payload into a canonical `RevenueEvent` object.
4. **Idempotent Persistence**:
   - Event is stored in `revenue_events`.
   - If `external_event_id` was already recorded for that `(workspace_id, source)`, the duplicate is ignored and acknowledged safely with `{ duplicate: true }`.
5. **Real-Time OBS Broadcast**:
   - New events trigger immediate SSE broadcast to connected OBS browser sources (`/events` stream).

---

## Stage 1 Compatibility Layer

To guarantee that existing ECPay donation flows and OBS overlays continue functioning seamlessly without breaking changes:
- ECPay callbacks persist both a canonical `revenue_events` record and maintain the legacy `workspace_settings` totals.
- The OBS overlay projection (`getProgress`) reads persistent workspace totals and alert history, deduplicating alerts by unique `alertId`.
- This compatibility projection will be replaced in Stage 3 by the programmable Goal Engine.
