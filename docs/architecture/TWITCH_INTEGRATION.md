# Twitch Integration Architecture (EventSub & OAuth)

## Overview

Donatio connects directly to Twitch using official Twitch OAuth 2.0 and the official Twitch EventSub webhook transport. This allows creators to have their Twitch Bits (Cheers) and Subscriptions automatically count toward their unified stream goals.

```text
Twitch Broadcaster Action (Cheer / Sub)
           ↓
Twitch EventSub Webhook Delivery
           ↓
POST /api/webhooks/twitch/:workspaceSlug
           ↓
Raw Body Signature Verification (HMAC-SHA256)
           ↓
Twitch Source Adapter
           ↓
Canonical Revenue Event
           ↓
Goal Engine (Creator programmable rules: e.g. 100 Bits = NT$30, Tier 1 = NT$75)
           ↓
Real-Time OBS Overlay
```

---

## 1. Official Documentation & Specifications

- **Twitch Developer API Reference**: Current Twitch EventSub API (v1).
- **Transport**: Webhook (HTTP POST over TLS on port 443).
- **Signature Mechanism**: HMAC-SHA256 over concatenated string: `Twitch-Eventsub-Message-Id + Twitch-Eventsub-Message-Timestamp + raw_body`.
- **Secret Requirement**: 10 to 100 ASCII characters per subscription.
- **Replay Window**: Request timestamp rejected if older than 10 minutes (600 seconds).
- **Challenge Verification**: Immediate response of status `200 OK` with raw `challenge` body string.

---

## 2. OAuth Scopes & Permissions

To capture creator stream events without excessive permissions, Donatio requests only the minimal necessary OAuth scopes:

| Scope | Purpose | Required For |
|---|---|---|
| `bits:read` | View Bits cheering events on creator's channel | `channel.cheer` (v1) |
| `channel:read:subscriptions` | View channel subscribers, resubs, and gift subs | `channel.subscribe`, `channel.subscription.gift`, `channel.subscription.message` (v1) |

---

## 3. Supported EventSub Subscription Types

| EventSub Type | Version | Condition | Description | Canonical Mapping |
|---|:---:|---|---|---|
| `channel.cheer` | `1` | `broadcaster_user_id` | Viewer cheers Bits on creator channel | `sourceEventType: 'cheer'`, `quantity: bits` |
| `channel.subscribe` | `1` | `broadcaster_user_id` | New subscription (non-gifted) | `sourceEventType: 'subscription'`, `tier: tier`, `quantity: 1` |
| `channel.subscription.gift` | `1` | `broadcaster_user_id` | Viewer gifts one or more subscriptions | `sourceEventType: 'subscription_gift'`, `tier: tier`, `quantity: total` |
| `channel.subscription.message` | `1` | `broadcaster_user_id` | Resubscription message shared in chat | `sourceEventType: 'resubscription_message'`, `tier: tier`, `quantity: cumulative_months` |

> **Safety Rule**: `channel.subscription.end` is intentionally **NOT** registered or counted as positive support. `channel.cheer` is the canonical Bits event path to prevent double-counting.

---

## 4. Normalization into Canonical Revenue Events

The Twitch Adapter acts as a pure, side-effect-free transform boundary:

### A. Cheer (Bits)
```json
{
  "workspaceId": "ws_123",
  "source": "twitch",
  "sourceEventType": "cheer",
  "externalEventId": "twitch:cheer:<message_id>",
  "occurredAt": "2026-08-23T14:00:00Z",
  "receivedAt": "2026-08-23T14:00:01Z",
  "supporterName": "Alice",
  "message": "Cheer500 Keep up the great streams!",
  "quantity": 500,
  "unit": "bits",
  "isSynthetic": false,
  "metadata": {
    "broadcasterUserId": "12345678",
    "isAnonymous": false
  }
}
```
*Note: Bits are normalized as non-monetary unit events (`quantity: 500`). The Goal Engine applies creator-configured economic weighting (e.g. 100 Bits = NT$30).*

### B. Tier 1 Subscription
```json
{
  "workspaceId": "ws_123",
  "source": "twitch",
  "sourceEventType": "subscription",
  "externalEventId": "twitch:sub:<message_id>",
  "occurredAt": "2026-08-23T14:05:00Z",
  "receivedAt": "2026-08-23T14:05:01Z",
  "supporterName": "Bob",
  "quantity": 1,
  "tier": "1000",
  "isSynthetic": false
}
```

### C. Community Gift Subscriptions (5 Gift Subs)
```json
{
  "workspaceId": "ws_123",
  "source": "twitch",
  "sourceEventType": "subscription_gift",
  "externalEventId": "twitch:gift:<message_id>",
  "occurredAt": "2026-08-23T14:10:00Z",
  "receivedAt": "2026-08-23T14:10:01Z",
  "supporterName": "Charlie",
  "quantity": 5,
  "tier": "1000",
  "isSynthetic": false,
  "metadata": {
    "isAnonymous": false,
    "cumulativeTotal": 25
  }
}
```

---

## 5. Webhook Security & Idempotency

1. **Signature Verification**: Validates `Twitch-Eventsub-Message-Signature` using the workspace's encrypted webhook secret over the exact raw request bytes.
2. **Timestamp Verification**: Rejects any request where `|now - Twitch-Eventsub-Message-Timestamp| > 600 seconds` to eliminate replay attacks.
3. **Database-Level Idempotency**: `uq_revenue_events_external_id` (`workspace_id`, `source`, `external_event_id`) guarantees that webhook retries from Twitch are acknowledged (`200 OK`) without double-incrementing Goal progress or OBS counters.

---

## 6. Lifecycle & Diagnostics

- **Connect**: Creator logs in via Twitch OAuth $\to$ Tokens stored encrypted $\to$ EventSub subscriptions created via Twitch API $\to$ Status set to `connected`.
- **Token Refresh**: When access token expires, server automatically uses refresh token to obtain a fresh token and updates encrypted database record.
- **Disconnect**: Deletes EventSub subscriptions via Twitch API $\to$ Marks connection `disconnected` $\to$ Historical Revenue Events and Goal contributions are strictly preserved.
