# Guide: Adding a New Revenue Source Adapter

## Scope & Target Stage

In Stage 1, the Universal Revenue Event Core is established with four active sources: `ecpay`, `webhook`, `manual`, and `test`.

When implementing additional platforms (such as Twitch, Ko-fi, Streamlabs, YouTube, or Patreon in **Stage 5**), follow this standardized recipe.

---

## Step-by-Step Implementation Recipe

### Step 1: Register the Source in `lib/source-registry.js`

1. Open [`lib/source-registry.js`](../../lib/source-registry.js).
2. Locate the source entry in `SOURCE_DEFINITIONS`.
3. Switch `status: 'active'`.
4. Verify or declare the source's `capabilities`:
   - `monetary`: `boolean` (Does the source produce fiat money?)
   - `nonMonetary`: `boolean` (Does it produce units like Bits, Stars, Points?)
   - `subscriptions`: `boolean` (Does it produce recurring subs?)
   - `supporterMessage`: `boolean` (Does it carry a supporter message?)
   - `multiCurrency`: `boolean` (Does it support multiple ISO 4217 currencies?)
   - `webhook`: `boolean` (Does it send HTTP webhooks?)
   - `realtime`: `boolean` (Does it connect via WebSockets / EventSub?)

```javascript
// Example in lib/source-registry.js
kofi: {
  id: 'kofi',
  name: 'Ko-fi',
  type: 'direct',
  description: 'Ko-fi donations, shop sales, and tier memberships',
  status: 'active', // changed from 'planned'
  capabilities: {
    monetary: true,
    nonMonetary: false,
    subscriptions: true,
    supporterMessage: true,
    multiCurrency: true,
    webhook: true,
    realtime: false
  }
}
```

---

### Step 2: Implement the Source Adapter Module

Create a dedicated adapter module under `lib/source-adapters/<source-name>-adapter.js` (or in `providers/` if it includes checkout flows).

The adapter must:
1. Validate external payload shape and required fields.
2. Extract or derive a stable `externalEventId`.
3. Normalize currency and integer minor unit amount using `normalizeRevenueCurrency` and `getCurrencyMinorUnitDecimals`.
4. Call `normalizeRevenueEvent(canonicalInput)`.
5. Strip and sanitize any secret tokens from `metadata`.

```javascript
// lib/source-adapters/kofi-adapter.js
import { normalizeRevenueEvent } from '../revenue-event.js';
import { normalizeRevenueCurrency } from '../money.js';

export function normalizeKofiWebhookPayload(rawPayload, { workspaceId }) {
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new Error('Invalid Ko-fi payload');
  }

  // Parse Ko-fi JSON wrapper if posted as URL-encoded data param
  const data = typeof rawPayload.data === 'string' ? JSON.parse(rawPayload.data) : rawPayload;

  const externalId = data.message_id || data.kofi_transaction_id;
  if (!externalId) throw new Error('Missing Ko-fi transaction ID');

  const currency = normalizeRevenueCurrency(data.currency || 'USD');
  const amountFloat = parseFloat(data.amount);
  const amountMinor = Math.round(amountFloat * 100);

  return normalizeRevenueEvent({
    workspaceId,
    source: 'kofi',
    sourceEventType: data.type === 'Subscription' ? 'subscription' : 'donation',
    externalEventId: String(externalId),
    occurredAt: data.timestamp || new Date().toISOString(),
    amount: {
      valueMinor: amountMinor,
      currency
    },
    tier: data.tier_name || null,
    supporter: {
      displayName: data.from_name || 'Anonymous',
      externalUserId: data.email || null
    },
    message: data.message || '',
    metadata: {
      isPublic: data.is_public !== false,
      shopItems: data.shop_items || []
    }
  });
}
```

---

### Step 3: Write Comprehensive Adapter Tests

Create `test/<source-name>-adapter.test.js` covering:
- Valid payload mapping.
- Currency and amount normalization.
- Handling missing optional fields.
- Rejection of negative amounts, floats, or malformed data.
- Absence of secret or credential leakage in metadata.

---

### Step 4: Register Transport Route or Listener

- If webhook-based:
  1. Add webhook signature / verification check.
  2. Normalize payload via the adapter.
  3. Call `database.addRevenueEvent(workspaceId, normalizedEvent)`.
  4. If `!result.duplicate`, trigger `broadcastProgress(workspaceId)`.
  5. Return provider acknowledgment code (e.g. HTTP 200).
- If socket-based (e.g., Twitch EventSub):
  1. Listen for incoming message.
  2. Pass payload to adapter.
  3. Persist and broadcast.

---

### Step 5: Verify Invariants

Run the full test suite:
```bash
npm test
```

Ensure:
- Zero credential leakage.
- Strict tenant boundary isolation.
- Idempotency constraint `(workspace_id, source, external_event_id)` works as expected.
- All regression tests remain green.
