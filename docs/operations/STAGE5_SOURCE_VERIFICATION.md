# Stage 5 Source Verification Guide & Runbook

## Scope

This document specifies the verification plan for Donatio's Stage 5 Global Source Integrations (Twitch, Ko-fi, ECPay, Generic Webhook).

---

## 1. Automated Test Matrix

Run the automated test suite:
```bash
npm test
```

### Required Test Coverage:
1. **Twitch Adapter & Webhooks**:
   - `channel.cheer` parsing into non-monetary unit event with bits quantity.
   - `channel.subscribe`, `channel.subscription.gift`, `channel.subscription.message` tier and quantity parsing.
   - HMAC-SHA256 raw body signature verification and rejection of altered payloads.
   - Replay protection (reject timestamps > 10 minutes).
   - EventSub challenge verification (`200 OK` with challenge string).
   - Idempotency per `(workspaceId, source, externalEventId)`.
2. **Ko-fi Adapter & Webhooks**:
   - `Donation` / tip parsing into minor unit ISO currency amounts.
   - `Subscription` monthly membership payment parsing.
   - Default exclusion of `Shop Order` and `Commission` commerce events from stream goals.
   - Verification token validation.
   - Idempotency on `message_id`.
3. **Multi-Source Goal Integration**:
   - Single goal receiving events from Twitch + Ko-fi + ECPay.
   - Programmable Goal rules applying correct source weighting (e.g. 100 Bits = NT$30, Ko-fi $5 USD = NT$150).
   - OBS overlay updating seamlessly in real time across all sources.

---

## 2. Staging End-to-End Acceptance Scenario

1. Log in to Creator Dashboard (`https://donatio-staging.jjmowlab.com/admin`).
2. Navigate to **Integrations / Sources** tab.
3. **Twitch Setup**:
   - Click "Connect Twitch" $\to$ complete OAuth authorization $\to$ verify status shows `Connected`.
4. **Ko-fi Setup**:
   - Copy workspace Ko-fi webhook URL $\to$ set in Ko-fi dashboard $\to$ trigger test payment $\to$ verify status shows `Connected`.
5. **Create Active Goal**:
   - Create Goal: "New Stream Equipment" with target NT$10,000.
   - Enable rules for Twitch Bits, Twitch Subs, Ko-fi Tips, and ECPay.
6. **Multi-Source Progress Delivery**:
   - Send Twitch Cheer (500 Bits) $\to$ verify Goal increments.
   - Send Ko-fi Tip ($10 USD) $\to$ verify same Goal increments.
   - Send ECPay donation (NT$300) $\to$ verify same Goal increments.
7. **Idempotency & Reconnect**:
   - Re-send duplicate webhook $\to$ verify Goal progress does not double-count.
   - Disconnect and reconnect Twitch $\to$ verify historical contributions and revenue events remain intact.
