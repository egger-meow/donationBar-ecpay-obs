# Generic Inbound Webhook

## Overview

The **Generic Inbound Webhook** enables streamers, bot developers, and platforms to ingest revenue and support events into DonationBar from any custom source (Discord bots, Stripe, PayPal, Patreon, Tiltify, custom shop checkouts, etc.).

---

## Endpoint Specification

- **Method**: `POST`
- **Path**: `/api/webhook/generic/:slug`
- **Rate Limit**: 600 requests / minute per IP (isolated provider callback bucket)
- **Body Size Limit**: 64 KB JSON payload

---

## Authentication

Every workspace is provisioned with a secure webhook secret token in format `whsec_<64_hex_chars>`.

Pass the token in either of the following HTTP headers:

1. `x-webhook-token: whsec_abc123...`
2. `Authorization: Bearer whsec_abc123...`

Authentication is verified using constant-time comparison (`crypto.timingSafeEqual`) to protect against timing side-channel attacks.

### Token Management

- Streamers can view their webhook URL and token in the creator settings.
- Rotating the token immediately invalidates the previous token:
  `POST /api/workspace/webhook-token/rotate`

---

## Inbound Payload Schema

### 1. Monetary Donation / Tip

```json
{
  "eventId": "stripe_ch_3MtwBwLkdIwHu7ix0snN0B15",
  "type": "donation",
  "amount": 1000,
  "currency": "USD",
  "supporter": "Alice",
  "message": "Great gameplay today!",
  "occurredAt": "2026-08-22T12:00:00Z",
  "metadata": {
    "platform": "Stripe"
  }
}
```

*Notes on monetary amounts:*
- `amount` is an integer in **minor currency units** (e.g. `1000` = `$10.00 USD`, `500` = `NT$500 TWD`, `1000` = `¥1000 JPY`).
- `currency` must be a valid uppercase 3-letter ISO 4217 code (e.g. `USD`, `EUR`, `GBP`, `TWD`, `JPY`, `CAD`, `AUD`).

---

### 2. Non-Monetary Unit Event (e.g. Bits, Points)

```json
{
  "eventId": "bot_bits_tx_99812",
  "type": "bits",
  "quantity": 500,
  "supporter": {
    "displayName": "GamerBob",
    "externalUserId": "bob_12345"
  },
  "message": "cheer500 clutch play!"
}
```

---

### 3. Subscription Event

```json
{
  "eventId": "sub_order_4410",
  "type": "subscription",
  "tier": "tier1",
  "quantity": 1,
  "amount": 499,
  "currency": "USD",
  "supporter": "SupporterName",
  "message": "Subscribed for 3 months in a row!"
}
```

---

## Idempotency & Replays

- The `eventId` field serves as the idempotency key.
- If a webhook delivery is retried with the exact same `eventId`:
  - DonationBar detects the duplicate.
  - Returns HTTP `200 OK` with `{"status": "success", "duplicate": true, "eventId": "..."}`.
  - The duplicate is **not** double-counted toward goal totals or alerts.

---

## Responses

### Success (New Event Created)
- **HTTP 201 Created**
```json
{
  "status": "success",
  "duplicate": false,
  "eventId": "a64bb76e-1861-4e47-a11b-3c11c433b40e"
}
```

### Success (Duplicate Event Acknowledged)
- **HTTP 200 OK**
```json
{
  "status": "success",
  "duplicate": true,
  "eventId": "a64bb76e-1861-4e47-a11b-3c11c433b40e"
}
```

### Error Responses
- `400 Bad Request`: `{"error": "Invalid revenue event currency: XYZ"}`
- `401 Unauthorized`: `{"error": "Invalid webhook authentication token"}`
- `404 Not Found`: `{"error": "Workspace not found"}`
- `429 Too Many Requests`: Rate limit exceeded

---

## Code Examples

### cURL
```bash
curl -X POST https://donationbar.jjmowlab.com/api/webhook/generic/my-workspace \
  -H "Content-Type: application/json" \
  -H "x-webhook-token: whsec_your_workspace_token_here" \
  -d '{
    "eventId": "custom-tx-001",
    "type": "donation",
    "amount": 500,
    "currency": "USD",
    "supporter": "GenerousFan",
    "message": "Hype!"
  }'
```

### Node.js (Fetch)
```javascript
const response = await fetch('https://donationbar.jjmowlab.com/api/webhook/generic/my-workspace', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer whsec_your_workspace_token_here'
  },
  body: JSON.stringify({
    eventId: `tx_${Date.now()}`,
    type: 'donation',
    amount: 1000, // $10.00 USD
    currency: 'USD',
    supporter: 'GamerGirl99',
    message: 'Love your stream!'
  })
});
const data = await response.json();
console.log('Result:', data);
```

### Python (requests)
```python
import requests

url = "https://donationbar.jjmowlab.com/api/webhook/generic/my-workspace"
headers = {
    "Content-Type": "application/json",
    "x-webhook-token": "whsec_your_workspace_token_here"
}
payload = {
    "eventId": "py-bot-12345",
    "type": "bits",
    "quantity": 250,
    "supporter": "PythonCoder",
    "message": "cheer250"
}

res = requests.post(url, json=payload, headers=headers)
print(res.json())
```
