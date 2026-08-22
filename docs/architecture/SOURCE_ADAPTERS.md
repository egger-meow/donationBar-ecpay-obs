# Source Adapters & Capability Matrix

## Overview

A **Source Adapter** is responsible for translating provider-specific webhook callbacks, API payloads, or internal operator actions into the Canonical `RevenueEvent` data model.

Adapters isolate the rest of the DonationBar codebase from third-party API quirks, transport differences, encoding formats, and authentication mechanisms.

---

## Active Stage 1 Adapters

| Source ID | Name | Module | Authentication | Primary Use Case |
|---|---|---|---|---|
| `ecpay` | ECPay (綠界科技) | [`providers/ecpay-donation-adapter.js`](../../providers/ecpay-donation-adapter.js) | SHA-256 CheckMacValue + AES-128-CBC payload decryption | Taiwan-based direct donations & credit card / ATM payments |
| `webhook` | Generic Webhook | [`lib/source-adapters/generic-webhook-adapter.js`](../../lib/source-adapters/generic-webhook-adapter.js) | Bearer Token / `x-webhook-token` | Custom bots, Discord integrations, Stripe/PayPal webhooks, third-party platforms |
| `manual` | Manual Entry | [`lib/source-adapters/manual-adapter.js`](../../lib/source-adapters/manual-adapter.js) | Authenticated Session + CSRF same-origin | Creator dashboard manual goal adjustments and cash tips |
| `test` | Test Console | [`lib/source-adapters/test-adapter.js`](../../lib/source-adapters/test-adapter.js) | Authenticated Session + CSRF same-origin | OBS browser source preview, milestone animation tests |

---

## Source Capability Matrix

The Source Registry ([`lib/source-registry.js`](../../lib/source-registry.js)) declares operational capabilities for each source:

| Feature Capability | `ecpay` | `webhook` | `manual` | `test` | `twitch` *(P)* | `kofi` *(P)* | `streamlabs` *(P)* | `youtube` *(P)* |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Monetary Events** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Non-Monetary Units** (e.g. Bits) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Recurring Subscriptions** | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Supporter Message** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Multi-Currency (ISO 4217)** | ❌ (TWD) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Webhook Transport** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Realtime Socket** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| **Status in Stage 1** | **Active** | **Active** | **Active** | **Active** | *Planned* | *Planned* | *Planned* | *Planned* |

*(P) = Planned for Stage 5. Defined in registry for architectural boundary validation, but unexposed in user-facing UI.*

---

## Source Adapter Boundaries & Rules

1. **No External Shapes Escape**:
   - No ECPay-specific, Twitch-specific, or provider-specific object structure may be returned outside the adapter.
   - All external data must be mapped into `normalizeRevenueEvent()`.
2. **Signature Verification Precedes Normalization**:
   - Signature checks (e.g. ECPay CheckMacValue or Webhook Bearer token) must be executed before parsing, normalizing, or trusting data.
3. **Idempotency Key Derivation**:
   - Every external source adapter must extract or derive a reliable `externalEventId`.
   - Replayed external events with the same `(workspace_id, source, external_event_id)` will be deduplicated safely.
4. **Synthetic Flag Enforcement**:
   - Events produced by `manual` and `test` sources always have `isSynthetic: true`.
   - Synthetic events can never create real payment records, trigger billing, or access payment secrets.
