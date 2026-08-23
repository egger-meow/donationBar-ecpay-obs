# Ko-fi Integration Architecture (Webhooks)

## Overview

Ko-fi enables global creators to receive tips, monthly memberships, and commissions from international supporters. Donatio provides a direct, zero-code webhook integration for Ko-fi that converts incoming tips and subscriptions into canonical revenue events for real-time goal progress.

```text
Ko-fi Supporter Payment (Tip / Sub)
           ↓
Ko-fi Webhook HTTP POST (application/x-www-form-urlencoded)
           ↓
POST /api/webhooks/kofi/:workspaceSlug
           ↓
Verification Token Validation
           ↓
Ko-fi Source Adapter
           ↓
Canonical Revenue Event (ISO 4217 Currency + Minor Units)
           ↓
Goal Engine (100% Monetary Passthrough / FX Conversion)
           ↓
Real-Time OBS Overlay
```

---

## 1. Official Documentation & Specifications

- **Payload Transport**: HTTP POST with `Content-Type: application/x-www-form-urlencoded`.
- **Payload Structure**: A single URL-encoded POST field named `data`, containing a serialized JSON string.
- **Verification**: `verification_token` inside the JSON object must strictly match the secret token configured in the creator's Ko-fi dashboard and stored encrypted in Donatio.
- **Idempotency Key**: `message_id` inside the JSON object uniquely identifies the payment transaction.
- **Acknowledgment**: HTTP `200 OK` response must be returned promptly to prevent Ko-fi from repeatedly retrying the webhook.

---

## 2. Supported Event Types & Semantics

Ko-fi sends several types of events. Donatio distinguishes between direct audience support (which counts toward stream goals) and general commerce (which is excluded by default):

| Ko-fi Event `type` | Description | Default Goal Rule | Canonical `sourceEventType` |
|---|---|:---:|---|
| `"Donation"` | Direct viewer tip / donation | **ENABLED** | `donation` |
| `"Subscription"` | Monthly membership payment | **ENABLED** | `subscription` |
| `"Shop Order"` | Merchandise / digital download sale | *EXCLUDED* | `shop_order` |
| `"Commission"` | Custom commissioned work | *EXCLUDED* | `commission` |

> **Rationale**: Merchandise sales and custom commissions involve cost-of-goods-sold and separate fulfillment obligations. They are not equivalent to stream goal donations and are therefore excluded by default.

---

## 3. Canonical Revenue Event Normalization

### A. Tip / Donation Example
Incoming Ko-fi JSON:
```json
{
  "verification_token": "secret-token-123",
  "message_id": "kofi-msg-45678",
  "timestamp": "2026-08-23T14:30:00Z",
  "type": "Donation",
  "from_name": "Bob",
  "message": "Love your content! ☕",
  "amount": "5.00",
  "currency": "USD",
  "is_subscription_payment": false
}
```

Normalized Canonical Event:
```json
{
  "workspaceId": "ws_123",
  "source": "kofi",
  "sourceEventType": "donation",
  "externalEventId": "kofi:kofi-msg-45678",
  "occurredAt": "2026-08-23T14:30:00Z",
  "receivedAt": "2026-08-23T14:30:01Z",
  "supporterName": "Bob",
  "message": "Love your content! ☕",
  "amountMinor": 500,
  "currency": "USD",
  "isSynthetic": false,
  "metadata": {
    "kofiType": "Donation",
    "isSubscriptionPayment": false
  }
}
```

### B. Recurring Membership Payment Example
```json
{
  "workspaceId": "ws_123",
  "source": "kofi",
  "sourceEventType": "subscription",
  "externalEventId": "kofi:kofi-sub-78901",
  "occurredAt": "2026-08-23T14:35:00Z",
  "receivedAt": "2026-08-23T14:35:01Z",
  "supporterName": "David",
  "message": "Monthly tier support",
  "amountMinor": 1000,
  "currency": "EUR",
  "isSynthetic": false
}
```

---

## 4. Webhook Security & Idempotency

1. **Token Authentication**: Incoming `verification_token` is validated against the workspace's configured token using constant-time comparison (`crypto.timingSafeEqual`).
2. **Payload Validation**: `amount` must be a valid numerical value, `currency` must be a supported ISO 4217 code, and `message_id` must be non-empty.
3. **Database Uniqueness**: Uniqueness constraint on `(workspace_id, 'kofi', external_event_id)` ensures duplicate deliveries resulting from network retries are acknowledged safely without duplicate accounting.
